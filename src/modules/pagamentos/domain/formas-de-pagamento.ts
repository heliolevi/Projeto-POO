import { PrazoDePagamento } from "../../../shared/dominio/prazos.ts";
import { CodigoPix } from "./codigo-pix.ts";
import {
  Pagamento,
  TransicaoDePagamentoInvalida,
  type CobrancaGerada,
  type DadosPagamento,
  type MetodoPagamento,
} from "./pagamento.ts";

// O Pix vale 15 minutos, o mesmo prazo da reserva pendente (uma constante só para os dois).
export const PRAZO_DO_PIX_MS = PrazoDePagamento.MS;

export type CobrancaPix = CobrancaGerada & {
  metodo: "PIX";
  // pagavelEmBanco: o copia e cola segue o BR Code do Banco Central (false no modo de teste da
  // Stripe, que devolve um código fictício de propósito)
  pix: { copiaECola: string; expiraEm: string; pagavelEmBanco: boolean };
};

// Pix. A cobrança é registrada no meio de pagamento (Stripe), que devolve o id dela e o "copia e
// cola"; só depois disso o Pix tem o que mostrar ao cliente. O copia e cola é um CodigoPix
// (composição): é ele que sabe se o texto é um BR Code de verdade.
export class PagamentoPix extends Pagamento {
  readonly #expiraEm: Date;
  #codigo: CodigoPix | null;

  constructor(dados: DadosPagamento) {
    super(dados);
    // sem prazo informado, vale 15 minutos a partir da criação; com o prazo da reserva, vale até ele
    this.#expiraEm = dados.expiraEm
      ? new Date(dados.expiraEm)
      : new Date(this.criadoEm.getTime() + PRAZO_DO_PIX_MS);
    if (this.#expiraEm.getTime() <= this.criadoEm.getTime()) {
      throw new RangeError("O prazo do Pix precisa ser depois da criação do pagamento.");
    }
    // texto vazio ou só com espaços (linha antiga do banco) é "sem cobrança", não um erro ao ler
    this.#codigo = dados.copiaECola?.trim() ? CodigoPix.de(dados.copiaECola) : null;
  }

  // Liga o pagamento à cobrança criada no meio de pagamento (id e "copia e cola").
  registrarCobranca(idExterno: string, copiaECola: string): void {
    if (!copiaECola) throw new RangeError("O meio de pagamento não devolveu o copia e cola do Pix.");
    const codigo = CodigoPix.de(copiaECola);
    this.vincularIdExterno(idExterno);
    this.#codigo = codigo;
  }

  get copiaECola(): string | null {
    return this.#codigo?.texto ?? null;
  }

  // O código pode ser pago em qualquer banco (false enquanto não há cobrança registrada).
  get pagavelEmBanco(): boolean {
    return this.#codigo?.pagavelEmBanco ?? false;
  }

  get metodo(): MetodoPagamento {
    return "PIX";
  }

  expiraEm(): Date {
    return new Date(this.#expiraEm);
  }

  estaVencido(agora: Date): boolean {
    return this.status === "PENDENTE" && agora.getTime() >= this.#expiraEm.getTime();
  }

  // O texto que o cliente copia e cola no aplicativo do banco.
  gerarPix(agora: Date): string {
    this.exigirPendente();
    if (agora.getTime() >= this.expiraEm().getTime()) {
      throw new TransicaoDePagamentoInvalida("O prazo deste Pix já venceu: gere uma nova cobrança.");
    }
    if (this.#codigo === null) {
      throw new TransicaoDePagamentoInvalida("A cobrança Pix ainda não foi registrada no meio de pagamento.");
    }
    return this.#codigo.texto;
  }

  gerar(agora: Date): CobrancaPix {
    const copiaECola = this.gerarPix(agora);
    return {
      ...this.resumo(),
      metodo: "PIX",
      pix: { copiaECola, expiraEm: this.expiraEm().toISOString(), pagavelEmBanco: this.pagavelEmBanco },
    };
  }

  cobrancaInicial(agora: Date): CobrancaPix {
    return this.gerar(agora);
  }
}

export type CobrancaCartao = CobrancaGerada & {
  metodo: "CARTAO_CREDITO" | "CARTAO_DEBITO";
  cartao: { finalDoCartao: string };
};

const TOKEN_DE_CARTAO = /^[A-Za-z0-9_-]{8,}$/;
const FINAL_DO_CARTAO = /^\d{4}$/;

export type DadosPagamentoCartao = DadosPagamento & { debito?: boolean };

// Cartão de crédito ou débito. Os dados do cartão nunca passam por aqui: o navegador troca o cartão
// por um token e só o token chega ao sistema. O token fica privado e a cobrança mostra só o final
// do cartão, que vem do meio de pagamento junto com o token (os últimos caracteres do token não
// têm relação com o número do cartão).
export class PagamentoCartao extends Pagamento {
  readonly #debito: boolean;
  #token: string | null = null;
  #finalDoCartao: string | null = null;

  constructor(dados: DadosPagamentoCartao) {
    super(dados);
    this.#debito = dados.debito ?? false;
  }

  get metodo(): CobrancaCartao["metodo"] {
    return this.#debito ? "CARTAO_DEBITO" : "CARTAO_CREDITO";
  }

  // Registra o token do cartão e o final dele (4 dígitos, como o meio de pagamento devolve) para a
  // cobrança. O pagamento continua PENDENTE até a operadora responder (confirmar, recusar).
  cobrarCartao(token: string, finalDoCartao: string): void {
    this.exigirPendente();
    if (!TOKEN_DE_CARTAO.test(token)) {
      throw new RangeError("Token de cartão inválido.");
    }
    if (!FINAL_DO_CARTAO.test(finalDoCartao)) {
      throw new RangeError("O final do cartão precisa ter 4 dígitos.");
    }
    this.#token = token;
    this.#finalDoCartao = finalDoCartao;
  }

  gerar(): CobrancaCartao {
    this.exigirPendente();
    if (this.#token === null || this.#finalDoCartao === null) {
      throw new TransicaoDePagamentoInvalida("Informe o cartão antes de gerar a cobrança.");
    }
    return {
      ...this.resumo(),
      metodo: this.metodo,
      cartao: { finalDoCartao: this.#finalDoCartao },
    };
  }

  // O cartão não tem prazo próprio: quem vence é a reserva.
  estaVencido(): boolean {
    return false;
  }

  // O cartão ainda espera o token do navegador: não há o que mostrar além do resumo.
  cobrancaInicial(): CobrancaGerada {
    return this.resumo();
  }
}

// Fábrica: escolhe a subclasse pela forma de pagamento. Quem usa só conhece Pagamento.
export function criarPagamento(metodo: MetodoPagamento, dados: DadosPagamento): Pagamento {
  switch (metodo) {
    case "PIX":
      return new PagamentoPix(dados);
    case "CARTAO_CREDITO":
      return new PagamentoCartao({ ...dados, debito: false });
    case "CARTAO_DEBITO":
      return new PagamentoCartao({ ...dados, debito: true });
    default: {
      const desconhecido: never = metodo;
      throw new RangeError(`Forma de pagamento desconhecida: ${String(desconhecido)}`);
    }
  }
}
