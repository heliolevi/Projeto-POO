import { NotFoundError } from "../../../shared/http/errors.ts";
import { Uuid } from "../../../shared/dominio/uuid.ts";
import { Reserva } from "../domain/reserva-entidade.ts";
import { ConsultaDeReservas } from "./consultar-reservas.ts";
import type { ExecutorDeReservas, SessaoCliente } from "./portas.ts";
import { MontadorDeReserva, type ReservaDto } from "./reserva-dto.ts";

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
export class CancelamentoDeReserva {
  readonly #executor: ExecutorDeReservas;
  readonly #agora: () => Date;

  constructor(deps: { executor: ExecutorDeReservas; agora: () => Date }) {
    this.#executor = deps.executor;
    this.#agora = deps.agora;
  }

  async cancelar(sessao: SessaoCliente, id: unknown): Promise<ReservaDto> {
    if (!Uuid.ehValido(id)) throw new NotFoundError(ConsultaDeReservas.MENSAGEM_NAO_ENCONTRADA);

    return this.#executor.executar(sessao, async (op) => {
      await op.expirarVencidas();
      const travada = await op.travarReserva(id);
      if (!travada) throw new NotFoundError(ConsultaDeReservas.MENSAGEM_NAO_ENCONTRADA);
      new Reserva(travada).cancelar(this.#agora());
      await op.marcarCancelada(id);
      const linha = await op.buscar(id);
      if (!linha) throw new NotFoundError(ConsultaDeReservas.MENSAGEM_NAO_ENCONTRADA);
      return MontadorDeReserva.reserva(linha);
    });
  }
}
