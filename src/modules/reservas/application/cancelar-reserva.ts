import { NotFoundError } from "../../../shared/http/errors.ts";
import { Reserva } from "../domain/reserva-entidade.ts";
import { ehUuid } from "../domain/reserva.ts";
import { MENSAGEM_NAO_ENCONTRADA } from "./consultar-reservas.ts";
import type { SessaoCliente, Transacao } from "./portas.ts";
import { montarReserva, type ReservaDto } from "./reserva-dto.ts";

// POST /api/reservas/{id}/cancelar (rota 15): cancela a reserva pendente ou confirmada que ainda
// não foi retirada. A bicicleta volta a ficar livre na hora (a exclusion constraint só vale para
// PENDENTE_PAGAMENTO, CONFIRMADA e EM_ANDAMENTO).
//
// Expira as vencidas primeiro: uma pendente que já passou dos 15 minutos é EXPIRADA, e cancelar
// uma expirada é 409, como no contrato. A reserva é travada (FOR UPDATE) antes de decidir, para dois
// cancelamentos ao mesmo tempo, ou um cancelamento e a retirada, não passarem juntos pela conferência.
//
// A regra "quem pode cancelar" é da classe Reserva (cancelar() consulta a tabela TRANSICOES, olha se o
// período já acabou e lança 409 com a mensagem do contrato): este caso de uso só trava, pergunta à
// classe e grava o resultado.
//
// O estorno de pagamento já aprovado não faz parte do MVP: o cancelamento de reserva paga é
// tratado no balcão (docs/contrato-api-mvp.md).
export function criarCancelarReserva(deps: { transacao: Transacao; agora: () => Date }) {
  const { agora } = deps;

  return async function cancelarReserva(sessao: SessaoCliente, id: unknown): Promise<ReservaDto> {
    if (!ehUuid(id)) throw new NotFoundError(MENSAGEM_NAO_ENCONTRADA);

    return deps.transacao(sessao, async (op) => {
      await op.expirarVencidas();
      const travada = await op.travarReserva(id);
      if (!travada) throw new NotFoundError(MENSAGEM_NAO_ENCONTRADA);
      new Reserva(travada).cancelar(agora());
      await op.marcarCancelada(id);
      const linha = await op.buscar(id);
      if (!linha) throw new NotFoundError(MENSAGEM_NAO_ENCONTRADA);
      return montarReserva(linha);
    });
  };
}
