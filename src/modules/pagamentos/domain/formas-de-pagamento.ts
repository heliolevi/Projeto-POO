import { PRAZO_DE_PAGAMENTO_MS } from "../../../shared/dominio/prazos.ts";
import {
  Pagamento,
  TransicaoDePagamentoInvalida,
  type CobrancaGerada,
  type DadosPagamento,
  type MetodoPagamento,
} from "./pagamento.ts";

// O Pix vale 15 minutos, o mesmo prazo da reserva pendente (uma constante só para os dois).
export const PRAZO_DO_PIX_MS = PRAZO_DE_PAGAMENTO_MS;

export type CobrancaPix = CobrancaGerada & {
  metodo: "PIX";
  pix: { copiaECola: string; expiraEm: string };
};

// Pix. No MVP o pagamento é simulado (a integração com o Mercado Pago está em stand by): o "copia e
// cola" é um texto reconhecível como de teste, no formato "PIX-SIMULADO|id|valor".
export class PagamentoPix extends Pagamento {
  constructor(dados: DadosPagamento) {
    super(dados);
  }

  get metodo(): MetodoPagamento {
    return "PIX";
  }

  expiraEm(): Date {
    return new Date(this.criadoEm.getTime() + PRAZO_DO_PIX_MS);
  }

  // O texto que o cliente copia e cola no aplicativo do banco.
  gerarPix(agora: Date): string {
    this.exigirPendente();
    if (agora.getTime() >= this.expiraEm().getTime()) {
      throw new TransicaoDePagamentoInvalida("O prazo deste Pix já venceu: gere uma nova cobrança.");
    }
    return `PIX-SIMULADO|${this.id}|${this.valor.centavos}`;
  }

  gerar(agora: Date): CobrancaPix {
    const copiaECola = this.gerarPix(agora);
    return {
      ...this.resumo(),
      metodo: "PIX",
      pix: { copiaECola, expiraEm: this.expiraEm().toISOString() },
    };
  }

  cobrancaInicial(agora: Date): CobrancaPix {
    return this.gerar(agora);
  }
}

export type CobrancaCartao = CobrancaGerada & {
  metodo: "CARTAO_CREDITO" | "CARTAO_DEBITO";
  cartao: { finalDoCartao: string | null };
};

const TOKEN_DE_CARTAO = /^[A-Za-z0-9_-]{8,}$/;

export type DadosPagamentoCartao = DadosPagamento & { debito?: boolean };

// Cartão de crédito ou débito. Os dados do cartão nunca passam por aqui: o navegador troca o cartão
// por um token e só o token chega ao sistema. O token fica privado e a cobrança mostra só o final.
export class PagamentoCartao extends Pagamento {
  readonly #debito: boolean;
  #token: string | null = null;

  constructor(dados: DadosPagamentoCartao) {
    super(dados);
    this.#debito = dados.debito ?? false;
  }

  get metodo(): CobrancaCartao["metodo"] {
    return this.#debito ? "CARTAO_DEBITO" : "CARTAO_CREDITO";
  }

  // Registra o token do cartão para a cobrança. O pagamento continua PENDENTE até a operadora
  // responder (confirmar, recusar).
  cobrarCartao(token: string): void {
    this.exigirPendente();
    if (!TOKEN_DE_CARTAO.test(token)) {
      throw new RangeError("Token de cartão inválido.");
    }
    this.#token = token;
  }

  gerar(): CobrancaCartao {
    this.exigirPendente();
    if (this.#token === null) {
      throw new TransicaoDePagamentoInvalida("Informe o cartão antes de gerar a cobrança.");
    }
    return {
      ...this.resumo(),
      metodo: this.metodo,
      cartao: { finalDoCartao: this.#token.slice(-4) },
    };
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
