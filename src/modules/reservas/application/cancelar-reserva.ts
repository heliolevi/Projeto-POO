import { ConflictError, NotFoundError } from "../../../shared/http/errors.ts";
import { ehUuid, podeCancelar } from "../domain/reserva.ts";
import { MENSAGEM_NAO_ENCONTRADA } from "./consultar-reservas.ts";
import type { SessaoCliente, Transacao } from "./portas.ts";
import { montarReserva, type ReservaDto } from "./reserva-dto.ts";

// POST /api/reservas/{id}/cancelar (rota 15): cancela a reserva pendente ou confirmada que ainda
// não foi retirada. A bicicleta volta a ficar livre na hora (a exclusion constraint só vale para
// PENDENTE_PAGAMENTO, CONFIRMADA e EM_ANDAMENTO).
//
// Expira as vencidas primeiro: uma pendente que já passou dos 15 minutos é EXPIRADA, e cancelar
// uma expirada é 409, como no contrato. A reserva é travada (FOR UPDATE) antes de conferir o
// status, para dois cancelamentos ao mesmo tempo, ou um cancelamento e a retirada, não passarem
// juntos pela conferência.
//
// O estorno de pagamento já aprovado não faz parte do MVP: o cancelamento de reserva paga é
// tratado no balcão (docs/contrato-api-mvp.md).
export function criarCancelarReserva(deps: { transacao: Transacao }) {
  return async function cancelarReserva(sessao: SessaoCliente, id: unknown): Promise<ReservaDto> {
    if (!ehUuid(id)) throw new NotFoundError(MENSAGEM_NAO_ENCONTRADA);

    return deps.transacao(sessao, async (op) => {
      await op.expirarVencidas();
      const status = await op.travarStatus(id);
      if (!status) throw new NotFoundError(MENSAGEM_NAO_ENCONTRADA);
      if (!podeCancelar(status)) {
        throw new ConflictError(
          "Esta reserva não pode mais ser cancelada: só vale para reserva pendente ou confirmada, antes da retirada.",
        );
      }
      await op.marcarCancelada(id);
      const linha = await op.buscar(id);
      if (!linha) throw new NotFoundError(MENSAGEM_NAO_ENCONTRADA);
      return montarReserva(linha);
    });
  };
}
