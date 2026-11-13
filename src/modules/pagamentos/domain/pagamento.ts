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
  // Quando foi pago. O banco exige pago_em preenchido exatamente quando o status é APROVADO
  // (constraint pagamento_pago_em_consistente), então um pagamento aprovado precisa dela.
  pagoEm?: Date | null;
  // Só o Pix usa: até quando a cobrança vale. É o menor entre 15 minutos e o prazo da reserva,
  // para o Pix não sobreviver à reserva que ele paga.
  expiraEm?: Date | null;
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
  #pagoEm: Date | null;

  protected constructor(dados: DadosPagamento) {
    if (!dados.id) throw new RangeError("O pagamento precisa de um id.");
    if (!dados.reservaId) throw new RangeError("O pagamento precisa de uma reserva.");
    if (dados.valor.ehZero()) throw new RangeError("O valor do pagamento precisa ser maior que zero.");
    const estornado = dados.valorEstornado ?? Dinheiro.ZERO;
    if (estornado.maiorQue(dados.valor)) throw new RangeError("O valor estornado não pode passar do valor pago.");
    const status = dados.status ?? "PENDENTE";
    const pagoEm = dados.pagoEm ? new Date(dados.pagoEm) : null;
    if (status === "APROVADO" && pagoEm === null) {
      throw new RangeError("Um pagamento aprovado precisa da data em que foi pago (pagoEm).");
    }
    this.#id = dados.id;
    this.#reservaId = dados.reservaId;
    this.#valor = dados.valor;
    this.#criadoEm = new Date(dados.criadoEm);
    this.#status = status;
    this.#mpPaymentId = dados.mpPaymentId ?? null;
    this.#valorEstornado = estornado;
    this.#pagoEm = pagoEm;
  }

  abstract get metodo(): MetodoPagamento;

  // Gera a cobrança para a tela (QR code do Pix, dados do cartão...). Só vale para pagamento pendente.
  abstract gerar(agora: Date): CobrancaGerada;

  // O que se devolve logo depois de criar o pagamento: o Pix já tem cobrança para mostrar; o cartão
  // ainda espera o token, então devolve só o resumo. Quem cria o pagamento chama este método e não
  // precisa saber qual forma é.
  abstract cobrancaInicial(agora: Date): CobrancaGerada;

  // A cobrança pendente já passou do prazo (só o Pix tem prazo próprio). O serviço expira o
  // pagamento vencido para poder criar outro, em vez de devolver a mesma cobrança morta.
  abstract estaVencido(agora: Date): boolean;

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
  get pagoEm(): Date | null {
    return this.#pagoEm === null ? null : new Date(this.#pagoEm);
  }

  // O que o repositório grava em pago_em: o banco só aceita a data quando o status é APROVADO. Depois
  // de um estorno total o status vira ESTORNADO e a coluna volta a ser nula.
  pagoEmParaPersistir(): Date | null {
    return this.#status === "APROVADO" ? this.pagoEm : null;
  }

  // Aprovação. Devolve true se mudou o pagamento de PENDENTE para APROVADO e guarda a data do
  // pagamento. Idempotente: o mesmo aviso do Mercado Pago chegando duas vezes (mesmo id) não muda
  // nada e devolve false; um id diferente num pagamento já aprovado é conflito.
  confirmar(mpPaymentId: string | null, agora: Date): boolean {
    if (this.#status === "APROVADO" && mpPaymentId === this.#mpPaymentId) return false;
    if (this.#status === "APROVADO") {
      throw new TransicaoDePagamentoInvalida("Este pagamento já foi aprovado com outro identificador.");
    }
    this.#mudarPara("APROVADO", "confirmar");
    this.#mpPaymentId = mpPaymentId;
    this.#pagoEm = new Date(agora);
    return true;
  }

  // Recusar e expirar também são idempotentes (devolvem true só se mudaram o status): o meio de
  // pagamento reenvia o aviso que não recebe resposta de sucesso, e o repetido não pode virar 409.
  recusar(): boolean {
    if (this.#status === "RECUSADO") return false;
    this.#mudarPara("RECUSADO", "recusar");
    return true;
  }

  expirar(): boolean {
    if (this.#status === "EXPIRADO") return false;
    this.#mudarPara("EXPIRADO", "expirar");
    return true;
  }

  // Estorna o que ainda resta. Idempotente: se já foi tudo estornado, não faz nada e devolve false.
  estornarTudo(): boolean {
    if (this.#status === "ESTORNADO") return false;
    this.estornar(this.restanteParaEstorno());
    return true;
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
