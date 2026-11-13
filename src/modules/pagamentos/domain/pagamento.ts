import { Dinheiro } from "../../../shared/dominio/dinheiro.ts";
import { ConflictError } from "../../../shared/http/errors.ts";

// Mesmos valores dos enums metodo_pagamento e status_pagamento do banco (migration 0006).
export const METODOS_PAGAMENTO = ["PIX", "CARTAO_CREDITO", "CARTAO_DEBITO"] as const;
export type MetodoPagamento = (typeof METODOS_PAGAMENTO)[number];

export const STATUS_PAGAMENTO = ["PENDENTE", "APROVADO", "RECUSADO", "ESTORNADO", "EXPIRADO"] as const;
export type StatusPagamento = (typeof STATUS_PAGAMENTO)[number];

// Para cada status, os que podem vir depois. Recusado, estornado e expirado são finais.
const TRANSICOES: Record<StatusPagamento, readonly StatusPagamento[]> = {
  PENDENTE: ["APROVADO", "RECUSADO", "EXPIRADO"],
  APROVADO: ["ESTORNADO"],
  RECUSADO: [],
  ESTORNADO: [],
  EXPIRADO: [],
};

// 409: o pagamento não está num estado que permita a operação pedida.
export class TransicaoDePagamentoInvalida extends ConflictError {}

export type DadosPagamento = {
  id: string;
  reservaId: string;
  valor: Dinheiro;
  criadoEm: Date;
  status?: StatusPagamento;
  // id do pagamento no Mercado Pago; fica vazio no MVP (pagamento simulado)
  mpPaymentId?: string | null;
  valorEstornado?: Dinheiro;
};

// O que a cobrança devolve para a tela. Cada forma de pagamento acrescenta os seus campos.
export type CobrancaGerada = {
  pagamentoId: string;
  reservaId: string;
  metodo: MetodoPagamento;
  status: StatusPagamento;
  valorCentavos: number;
};

// Classe abstrata: não existe "um pagamento qualquer", só por Pix ou por cartão. Guarda o que é
// comum (valor, status, o ciclo de vida e o estorno) e deixa para as subclasses o que muda por
// forma de pagamento: o `metodo` e o `gerar()` (polimorfismo).
//
// Encapsulamento: o status e os valores são privados. O pagamento só passa de PENDENTE para
// APROVADO/RECUSADO/EXPIRADO por confirmar(), recusar() e expirar(), e só estorna o que foi aprovado.
export abstract class Pagamento {
  readonly #id: string;
  readonly #reservaId: string;
  readonly #valor: Dinheiro;
  readonly #criadoEm: Date;
  #status: StatusPagamento;
  #mpPaymentId: string | null;
  #valorEstornado: Dinheiro;

  protected constructor(dados: DadosPagamento) {
    if (!dados.id) throw new RangeError("O pagamento precisa de um id.");
    if (!dados.reservaId) throw new RangeError("O pagamento precisa de uma reserva.");
    if (dados.valor.ehZero()) throw new RangeError("O valor do pagamento precisa ser maior que zero.");
    const estornado = dados.valorEstornado ?? Dinheiro.ZERO;
    if (estornado.maiorQue(dados.valor)) throw new RangeError("O valor estornado não pode passar do valor pago.");
    this.#id = dados.id;
    this.#reservaId = dados.reservaId;
    this.#valor = dados.valor;
    this.#criadoEm = new Date(dados.criadoEm);
    this.#status = dados.status ?? "PENDENTE";
    this.#mpPaymentId = dados.mpPaymentId ?? null;
    this.#valorEstornado = estornado;
  }

  abstract get metodo(): MetodoPagamento;

  // Gera a cobrança para a tela (QR code do Pix, dados do cartão...). Só vale para pagamento pendente.
  abstract gerar(agora: Date): CobrancaGerada;

  // O que se devolve logo depois de criar o pagamento: o Pix já tem cobrança para mostrar; o cartão
  // ainda espera o token, então devolve só o resumo. Quem cria o pagamento chama este método e não
  // precisa saber qual forma é.
  abstract cobrancaInicial(agora: Date): CobrancaGerada;

  get id(): string {
    return this.#id;
  }
  get reservaId(): string {
    return this.#reservaId;
  }
  get valor(): Dinheiro {
    return this.#valor;
  }
  get status(): StatusPagamento {
    return this.#status;
  }
  get mpPaymentId(): string | null {
    return this.#mpPaymentId;
  }
  get valorEstornado(): Dinheiro {
    return this.#valorEstornado;
  }
  get criadoEm(): Date {
    return new Date(this.#criadoEm);
  }

  // Aprovação. Devolve true se mudou o pagamento de PENDENTE para APROVADO. Idempotente: o mesmo aviso
  // do Mercado Pago chegando duas vezes (mesmo id) não muda nada e devolve false; um id diferente num
  // pagamento já aprovado é conflito.
  confirmar(mpPaymentId: string | null): boolean {
    if (this.#status === "APROVADO" && mpPaymentId === this.#mpPaymentId) return false;
    if (this.#status === "APROVADO") {
      throw new TransicaoDePagamentoInvalida("Este pagamento já foi aprovado com outro identificador.");
    }
    this.#mudarPara("APROVADO", "confirmar");
    this.#mpPaymentId = mpPaymentId;
    return true;
  }

  recusar(): void {
    this.#mudarPara("RECUSADO", "recusar");
  }

  expirar(): void {
    this.#mudarPara("EXPIRADO", "expirar");
  }

  // Devolve parte ou todo o valor de um pagamento aprovado. Estornado o valor inteiro, o pagamento
  // passa a ESTORNADO; antes disso continua APROVADO, com o total já estornado guardado.
  estornar(valor: Dinheiro): void {
    if (this.#status !== "APROVADO") {
      throw new TransicaoDePagamentoInvalida(
        `Não é possível estornar: o pagamento está ${this.#status}, e só se estorna um pagamento aprovado.`,
      );
    }
    if (valor.ehZero()) throw new RangeError("O valor do estorno precisa ser maior que zero.");
    if (valor.maiorQue(this.restanteParaEstorno())) {
      throw new RangeError("O estorno não pode passar do que ainda resta do pagamento.");
    }
    this.#valorEstornado = this.#valorEstornado.somar(valor);
    if (this.#valorEstornado.igual(this.#valor)) this.#status = "ESTORNADO";
  }

  restanteParaEstorno(): Dinheiro {
    return this.#valor.subtrair(this.#valorEstornado);
  }

  #mudarPara(novo: StatusPagamento, verbo: string): void {
    if (!TRANSICOES[this.#status].includes(novo)) {
      throw new TransicaoDePagamentoInvalida(
        `Não é possível ${verbo}: o pagamento está ${this.#status} e não pode passar para ${novo}.`,
      );
    }
    this.#status = novo;
  }

  // Os dados comuns da cobrança (sem o que é próprio de cada forma de pagamento).
  resumo(): CobrancaGerada {
    return {
      pagamentoId: this.#id,
      reservaId: this.#reservaId,
      metodo: this.metodo,
      status: this.#status,
      valorCentavos: this.#valor.centavos,
    };
  }

  // Só pagamento pendente gera cobrança (aprovado, recusado ou expirado já não se cobra).
  protected exigirPendente(): void {
    if (this.#status !== "PENDENTE") {
      throw new TransicaoDePagamentoInvalida(`O pagamento está ${this.#status} e não pode mais gerar cobrança.`);
    }
  }
}
