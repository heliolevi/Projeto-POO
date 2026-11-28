import { NotFoundError, ValidationError } from "../../../shared/http/errors.ts";
import { Uuid } from "../../../shared/dominio/uuid.ts";
import { RegrasDeReserva } from "../domain/reserva.ts";
import type { ExecutorDeReservas, SessaoCliente } from "./portas.ts";
import { MontadorDeReserva, type ReservaDetalhadaDto, type ReservaDto } from "./reserva-dto.ts";

// As consultas do cliente sobre as próprias reservas (rotas 13 e 14). O executor da transação entra
// pelo construtor; a sessão chega a cada chamada, então uma instância serve a todas as requisições.
export class ConsultaDeReservas {
  static readonly MENSAGEM_NAO_ENCONTRADA = "Reserva não encontrada.";

  readonly #executor: ExecutorDeReservas;

  constructor(executor: ExecutorDeReservas) {
    this.#executor = executor;
  }

  // GET /api/reservas (rota 13): as reservas do cliente, da mais recente para a mais antiga. Antes de
  // listar, marca como EXPIRADA as pendentes vencidas, para a lista nunca mostrar como pendente uma
  // reserva que já perdeu o prazo. "Só as minhas" é da segurança por linha do banco (a view
  // reserva_detalhada filtra pela sessão), não de um WHERE do código.
  async listar(sessao: SessaoCliente, filtros: { status?: unknown }): Promise<ReservaDto[]> {
    const bruto = filtros.status;
    const semFiltro = bruto === undefined || bruto === null || bruto === "";
    if (!semFiltro && !RegrasDeReserva.ehStatus(bruto)) {
      throw new ValidationError("Dados inválidos.", {
        status: `Status inválido. Use um destes valores: ${RegrasDeReserva.STATUS.join(", ")}.`,
      });
    }
    const status = semFiltro ? null : (bruto as (typeof RegrasDeReserva.STATUS)[number]);

    return this.#executor.executar(sessao, async (op) => {
      await op.expirarVencidas();
      return (await op.listar(status)).map(MontadorDeReserva.reserva);
    });
  }

  // GET /api/reservas/{id} (rota 14). Reserva de outro cliente e reserva que não existe dão o mesmo
  // 404: a resposta não diz qual dos dois (a RLS esconde a de outro como se não existisse).
  async buscar(sessao: SessaoCliente, id: unknown): Promise<ReservaDetalhadaDto> {
    if (!Uuid.ehValido(id)) throw new NotFoundError(ConsultaDeReservas.MENSAGEM_NAO_ENCONTRADA);

    return this.#executor.executar(sessao, async (op) => {
      await op.expirarVencidas();
      const linha = await op.buscar(id);
      if (!linha) throw new NotFoundError(ConsultaDeReservas.MENSAGEM_NAO_ENCONTRADA);
      return MontadorDeReserva.detalhada(linha);
    });
  }
}
