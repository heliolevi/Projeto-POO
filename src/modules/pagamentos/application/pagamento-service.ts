import { Dinheiro } from "../../../shared/dominio/dinheiro.ts";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/http/errors.ts";
import { PRAZO_DO_PIX_MS, criarPagamento } from "../domain/formas-de-pagamento.ts";
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
  // o pagamento ainda pendente da reserva, qualquer que seja a forma, se houver. Uma reserva tem no
  // máximo um pendente por vez: é o que impede cobrar duas vezes. O banco ainda não impõe isso (não há
  // índice único parcial em pagamento(reserva_id) para PENDENTE e APROVADO): deve entrar quando o
  // repositório for escrito.
  buscarPendenteDaReserva(reservaId: string): Promise<Pagamento | null>;
};

// A reserva como o pagamento a enxerga: só o que importa para cobrar.
export type ReservaParaPagar = {
  id: string;
  status: string;
  valorAluguelCentavos: number;
  // quando a reserva pendente expira; o Pix não pode valer mais que isso
  expiraEm: Date | null;
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

  // POST /api/pagamentos. Uma reserva tem no máximo um pagamento pendente por vez:
  // - o mesmo método ainda válido: devolve a mesma cobrança, sem criar outra (idempotente);
  // - outro método ainda válido: 409, para não cobrar a mesma reserva duas vezes;
  // - pendente vencido (Pix): é expirado e a nova tentativa cria uma cobrança nova.
  // O Pix vale até o menor entre 15 minutos e o prazo da reserva, então nunca sobrevive a ela.
  async iniciarPagamento(reserva: ReservaParaPagar, metodo: unknown): Promise<CobrancaGerada> {
    if (!ehMetodo(metodo)) {
      throw new ValidationError("Dados inválidos.", {
        metodo: `Forma de pagamento inválida. Use um destes valores: ${METODOS_PAGAMENTO.join(", ")}.`,
      });
    }
    if (reserva.status !== "PENDENTE_PAGAMENTO") {
      throw new ConflictError("Só uma reserva pendente de pagamento pode ser paga.");
    }
    const agora = this.#deps.agora();
    if (reserva.expiraEm && agora.getTime() >= reserva.expiraEm.getTime()) {
      throw new ConflictError("O prazo para pagar esta reserva já venceu.");
    }

    let existente = await this.#deps.repositorio.buscarPendenteDaReserva(reserva.id);
    if (existente?.estaVencido(agora)) {
      existente.expirar();
      await this.#deps.repositorio.salvar(existente);
      existente = null;
    }
    if (existente) {
      if (existente.metodo !== metodo) {
        throw new ConflictError(
          "Esta reserva já tem um pagamento pendente por outra forma. Conclua-o ou espere ele vencer antes de escolher outra.",
        );
      }
      return existente.cobrancaInicial(agora);
    }

    const limite = agora.getTime() + PRAZO_DO_PIX_MS;
    const pagamento = criarPagamento(metodo, {
      id: this.#deps.gerarId(),
      reservaId: reserva.id,
      valor: Dinheiro.deCentavos(reserva.valorAluguelCentavos),
      criadoEm: agora,
      expiraEm: new Date(reserva.expiraEm ? Math.min(limite, reserva.expiraEm.getTime()) : limite),
    });
    await this.#deps.repositorio.salvar(pagamento);
    return pagamento.cobrancaInicial(agora);
  }

  // Webhook do meio de pagamento. Idempotente para todos os tipos de aviso (aprovado, recusado,
  // expirado e estornado): o mesmo aviso repetido não muda nada, responde sucesso e não confirma a
  // reserva duas vezes. Um aviso que contradiz o estado (por exemplo, recusado para um pagamento já
  // aprovado) continua sendo 409.
  async processarWebhook(evento: EventoDePagamento): Promise<{ pagamentoId: string; status: string }> {
    const pagamento = await this.#deps.repositorio.buscarPorId(evento.pagamentoId);
    if (!pagamento) throw new NotFoundError("Pagamento não encontrado.");

    let aprovadoAgora = false;
    switch (evento.situacao) {
      case "aprovado":
        aprovadoAgora = pagamento.confirmar(evento.mpPaymentId, this.#deps.agora());
        break;
      case "recusado":
        pagamento.recusar();
        break;
      case "expirado":
        pagamento.expirar();
        break;
      case "estornado":
        pagamento.estornarTudo();
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
