import { NotFoundError, ValidationError } from "../../../shared/http/errors.ts";
import { ehStatusReserva, ehUuid, STATUS_RESERVA } from "../domain/reserva.ts";
import type { SessaoCliente, Transacao } from "./portas.ts";
import {
  montarReserva,
  montarReservaDetalhada,
  type Reserva,
  type ReservaDetalhada,
} from "./reserva-dto.ts";

export const MENSAGEM_NAO_ENCONTRADA = "Reserva não encontrada.";

// GET /api/reservas (rota 13): as reservas do cliente, da mais recente para a mais antiga. Antes de
// listar, marca como EXPIRADA as pendentes vencidas, para a lista nunca mostrar como pendente uma
// reserva que já perdeu o prazo. "Só as minhas" é da segurança por linha do banco (a view
// reserva_detalhada filtra pela sessão), não de um WHERE do código.
export function criarListarReservas(deps: { transacao: Transacao }) {
  return async function listarReservas(
    sessao: SessaoCliente,
    filtros: { status?: unknown },
  ): Promise<Reserva[]> {
    const bruto = filtros.status;
    const semFiltro = bruto === undefined || bruto === null || bruto === "";
    if (!semFiltro && !ehStatusReserva(bruto)) {
      throw new ValidationError("Dados inválidos.", {
        status: `Status inválido. Use um destes valores: ${STATUS_RESERVA.join(", ")}.`,
      });
    }
    const status = semFiltro ? null : (bruto as (typeof STATUS_RESERVA)[number]);

    return deps.transacao(sessao, async (op) => {
      await op.expirarVencidas();
      return (await op.listar(status)).map(montarReserva);
    });
  };
}

// GET /api/reservas/{id} (rota 14). Reserva de outro cliente e reserva que não existe dão o mesmo
// 404: a resposta não diz qual dos dois (a RLS esconde a de outro como se não existisse).
export function criarBuscarReserva(deps: { transacao: Transacao }) {
  return async function buscarReserva(sessao: SessaoCliente, id: unknown): Promise<ReservaDetalhada> {
    if (!ehUuid(id)) throw new NotFoundError(MENSAGEM_NAO_ENCONTRADA);

    return deps.transacao(sessao, async (op) => {
      await op.expirarVencidas();
      const linha = await op.buscar(id);
      if (!linha) throw new NotFoundError(MENSAGEM_NAO_ENCONTRADA);
      return montarReservaDetalhada(linha);
    });
  };
}
