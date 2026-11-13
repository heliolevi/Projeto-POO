import { Dinheiro } from "../../../shared/dominio/dinheiro.ts";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/http/errors.ts";
import { criarPagamento } from "../domain/formas-de-pagamento.ts";
import {
  METODOS_PAGAMENTO,
  type CobrancaGerada,
  type MetodoPagamento,
  type Pagamento,
} from "../domain/pagamento.ts";

// O que o serviço precisa do armazenamento: a implementação real fala com o banco (SQL
// parametrizado) e os testes usam uma versão em memória.
export type RepositorioDePagamentos = {
  salvar(pagamento: Pagamento): Promise<void>;
  buscarPorId(id: string): Promise<Pagamento | null>;
  // o pagamento ainda pendente da reserva, se houver (para o Pix ser idempotente)
  buscarPendenteDaReserva(reservaId: string, metodo: MetodoPagamento): Promise<Pagamento | null>;
};

// A reserva como o pagamento a enxerga: só o que importa para cobrar.
export type ReservaParaPagar = {
  id: string;
  status: string;
  valorAluguelCentavos: number;
};

// Aviso do meio de pagamento (webhook), já traduzido para o vocabulário do sistema.
export type EventoDePagamento = {
  pagamentoId: string;
  mpPaymentId: string | null;
  situacao: "aprovado" | "recusado" | "expirado" | "estornado";
};

const ehMetodo = (valor: unknown): valor is MetodoPagamento =>
  (METODOS_PAGAMENTO as readonly unknown[]).includes(valor);

export type DependenciasPagamentoService = {
  repositorio: RepositorioDePagamentos;
  agora: () => Date;
  gerarId: () => string;
  // chamado quando um pagamento é aprovado, para confirmar a reserva (módulo reservas)
  aoAprovar: (reservaId: string) => Promise<void>;
};

// Serviço de aplicação dos pagamentos: cria a cobrança de uma reserva e processa os avisos do meio
// de pagamento. Cobra só o aluguel; a caução é combinada no balcão.
export class PagamentoService {
  readonly #deps: DependenciasPagamentoService;

  constructor(deps: DependenciasPagamentoService) {
    this.#deps = deps;
  }

  // POST /api/pagamentos. Idempotente: se a reserva já tem um pagamento pendente por esse método,
  // devolve a mesma cobrança em vez de criar outra.
  async iniciarPagamento(reserva: ReservaParaPagar, metodo: unknown): Promise<CobrancaGerada> {
    if (!ehMetodo(metodo)) {
      throw new ValidationError("Dados inválidos.", {
        metodo: `Forma de pagamento inválida. Use um destes valores: ${METODOS_PAGAMENTO.join(", ")}.`,
      });
    }
    if (reserva.status !== "PENDENTE_PAGAMENTO") {
      throw new ConflictError("Só uma reserva pendente de pagamento pode ser paga.");
    }
    const existente = await this.#deps.repositorio.buscarPendenteDaReserva(reserva.id, metodo);
    if (existente) return existente.cobrancaInicial(this.#deps.agora());

    const pagamento = criarPagamento(metodo, {
      id: this.#deps.gerarId(),
      reservaId: reserva.id,
      valor: Dinheiro.deCentavos(reserva.valorAluguelCentavos),
      criadoEm: this.#deps.agora(),
    });
    await this.#deps.repositorio.salvar(pagamento);
    return pagamento.cobrancaInicial(this.#deps.agora());
  }

  // Webhook do meio de pagamento. Idempotente: o mesmo aviso repetido não muda nada nem confirma a
  // reserva duas vezes.
  async processarWebhook(evento: EventoDePagamento): Promise<{ pagamentoId: string; status: string }> {
    const pagamento = await this.#deps.repositorio.buscarPorId(evento.pagamentoId);
    if (!pagamento) throw new NotFoundError("Pagamento não encontrado.");

    let aprovadoAgora = false;
    switch (evento.situacao) {
      case "aprovado":
        aprovadoAgora = pagamento.confirmar(evento.mpPaymentId);
        break;
      case "recusado":
        pagamento.recusar();
        break;
      case "expirado":
        pagamento.expirar();
        break;
      case "estornado":
        pagamento.estornar(pagamento.restanteParaEstorno());
        break;
    }
    // A reserva é confirmada ANTES de gravar o pagamento como aprovado: se a confirmação falhar, o
    // pagamento continua pendente no armazenamento e o reenvio do aviso tenta de novo. Se fosse
    // gravado antes, o reenvio seria tratado como duplicado e a reserva ficaria sem confirmar. (Na
    // implementação com banco, os dois passos rodam na mesma transação.)
    if (aprovadoAgora) await this.#deps.aoAprovar(pagamento.reservaId);
    await this.#deps.repositorio.salvar(pagamento);
    return { pagamentoId: pagamento.id, status: pagamento.status };
  }
}
