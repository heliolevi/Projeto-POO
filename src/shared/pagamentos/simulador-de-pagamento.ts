import { ApiError, getAutenticado, postAutenticado } from "../http/api-cliente.ts";
import { caminhoDaSimulacao, situacaoDoPix, type StatusDoPagamento } from "./pagamento.ts";
import {
  SimulacaoAindaPendente,
  SimulacaoConfirmada,
  SimulacaoEncerrada,
  SimulacaoFalhou,
  SimulacaoIndisponivel,
  SimulacaoPagaSemReserva,
  SimulacaoReservaNaoAceita,
  SimulacaoReservaNaoEncontrada,
  type ResultadoDaSimulacao,
} from "./resultado-da-simulacao.ts";

/** O que o simulador precisa do cliente HTTP; os dois lançam ApiError. Nos testes entra um de mentira. */
export type ClienteDoPagamento = {
  post: (url: string) => Promise<unknown>;
  status: (reservaId: string) => Promise<StatusDoPagamento>;
};

const clientePadrao: ClienteDoPagamento = {
  post: (url) => postAutenticado<unknown>(url, {}),
  status: (reservaId) => getAutenticado<StatusDoPagamento>(`/api/pagamentos/${reservaId}/status`),
};

/** Código do contrato para "simulação desligada" (PAGAMENTO_MODO diferente de simulado). */
export const CODIGO_SIMULACAO_INDISPONIVEL = "SIMULACAO_INDISPONIVEL";

// Aprova o Pix simulado e confere o resultado pela rota 17, como a tela faz com um Pix de verdade.
// Nunca lança: devolve sempre um ResultadoDaSimulacao.
export class SimuladorDePagamento {
  readonly #cliente: ClienteDoPagamento;

  constructor(cliente: ClienteDoPagamento = clientePadrao) {
    this.#cliente = cliente;
  }

  async aprovar(reservaId: string): Promise<ResultadoDaSimulacao> {
    try {
      await this.#cliente.post(caminhoDaSimulacao(reservaId));
    } catch (erro) {
      return this.#tratarErro(erro, reservaId);
    }
    return (await this.#conferir(reservaId)) ?? new SimulacaoAindaPendente();
  }

  /** Lê o status e traduz. null quando a leitura falha ou o pagamento ainda está pendente. */
  async #conferir(reservaId: string): Promise<ResultadoDaSimulacao | null> {
    try {
      const status = await this.#cliente.status(reservaId);
      switch (situacaoDoPix(status)) {
        case "confirmado":
          return new SimulacaoConfirmada();
        case "encerrado":
          return new SimulacaoEncerrada();
        case "pago_sem_reserva":
          return new SimulacaoPagaSemReserva();
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  async #tratarErro(erro: unknown, reservaId: string): Promise<ResultadoDaSimulacao> {
    if (!(erro instanceof ApiError)) {
      return new SimulacaoFalhou("Não foi possível simular o pagamento agora.");
    }
    // O 409 também quer dizer "já paga": confere antes de dizer que não aceita mais pagamento.
    if (erro.status === 409) return (await this.#conferir(reservaId)) ?? new SimulacaoReservaNaoAceita();
    if (erro.code === CODIGO_SIMULACAO_INDISPONIVEL) return new SimulacaoIndisponivel();
    if (erro.status === 404) {
      // 404 com o JSON do contrato é a reserva; 404 sem ele (página HTML do Next) é rota que não existe.
      return erro.code === "NOT_FOUND" ? new SimulacaoReservaNaoEncontrada() : new SimulacaoIndisponivel();
    }
    return new SimulacaoFalhou(erro.message);
  }
}
