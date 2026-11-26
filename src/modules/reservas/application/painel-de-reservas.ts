import type { SessaoBanco } from "../../../shared/db/sessao.ts";
import { ValidationError } from "../../../shared/http/errors.ts";
import { FiltroDoPainel, type ParametrosDoPainel } from "../domain/filtro-do-painel.ts";
import type { ReservaDoPainel, ReservaDoPainelDto } from "../domain/reserva-do-painel.ts";

// Quem consulta o painel: a equipe logada, como o PerfisPermitidos devolve. A mesma sessão vai para
// o banco, então as políticas de RLS valem.
export type SessaoDaEquipe = SessaoBanco & { perfil: "OPERADOR" | "ADMIN"; usuarioId: string };

// O que se pode fazer dentro de UMA transação do banco (a que o comSessao abre). O serviço só fala
// com esta interface, então os testes trocam o banco por uma versão em memória.
export interface OperacoesDoPainel {
  // marca como EXPIRADA toda pendente vencida (função expirar_reservas_vencidas, migration 0008)
  expirarVencidas(): Promise<void>;
  listar(filtro: FiltroDoPainel): Promise<ReservaDoPainel[]>;
}

// Abre a transação com a sessão declarada e entrega as operações. O RepositorioDoPainel faz isso de
// verdade; o teste entrega um de mentira.
export interface ExecutorDoPainel {
  executar<T>(sessao: SessaoDaEquipe, fn: (operacoes: OperacoesDoPainel) => Promise<T>): Promise<T>;
}

// GET /api/admin/reservas (rota 25): as reservas para o balcão e o administrador, com o nome do
// cliente e a unidade escolhida. O filtro é validado ANTES de abrir qualquer transação (400), e as
// pendentes vencidas são expiradas na mesma transação antes de listar, para o painel nunca mostrar
// como pendente uma reserva que já caiu.
export class PainelDeReservas {
  readonly #executor: ExecutorDoPainel;

  constructor(executor: ExecutorDoPainel) {
    this.#executor = executor;
  }

  async listar(sessao: SessaoDaEquipe, parametros: ParametrosDoPainel): Promise<ReservaDoPainelDto[]> {
    const lido = FiltroDoPainel.validar(parametros);
    if ("erros" in lido) throw new ValidationError("Filtro inválido.", lido.erros);

    return this.#executor.executar(sessao, async (operacoes) => {
      await operacoes.expirarVencidas();
      const reservas = await operacoes.listar(lido.filtro);
      return reservas.map((reserva) => reserva.paraDto());
    });
  }
}
