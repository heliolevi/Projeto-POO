import type { SessaoBanco } from "../../../shared/db/sessao.ts";
import type { Atividade, Experiencia } from "../domain/perfil.ts";
import type { TipoCandidato } from "../domain/recomendacao.ts";

export type Periodo = { inicio: Date; fim: Date };
export type Precos = { precoHoraCentavos: number; precoDiaCentavos: number };

/** Perfil do cliente como a conta o guarda: a atividade é a preferida, que a busca pode trocar. */
export type PerfilDoCliente = {
  alturaCm: number | null;
  experiencia: Experiencia | null;
  atividade: Atividade | null;
};

/**
 * Quem faz a busca: o cliente logado, como o PerfisPermitidos devolve. A mesma sessão vai para o
 * comSessao, então as políticas de RLS valem. Por isso a busca recebe a sessão a cada chamada e pode
 * ser criada uma vez só, no escopo do módulo.
 */
export type SessaoCliente = SessaoBanco & { perfil: "CLIENTE"; usuarioId: string };

/** O limite de buscas (a LimiteDeTentativas de verdade, ou uma de mentira nos testes). */
export interface LimiteDeBuscas {
  exigirDentroDoLimite(chave: string, regra: { max: number; janelaSegundos: number }): Promise<void>;
}

/** De onde vem o perfil do ciclista (o módulo contas entrega o de verdade). */
export interface PerfisDosClientes {
  consultar(usuarioId: string): Promise<PerfilDoCliente>;
}

/** Os tipos ativos com a contagem de unidades livres no período (sem reserva ativa sobreposta). */
export interface DisponibilidadeDeTipos {
  tiposComUnidadesLivres(sessao: SessaoCliente, inicio: Date, fim: Date): Promise<TipoCandidato[]>;
}

/** A regra de preço mora em shared/dominio/preco-aluguel.ts e é a mesma da criação da reserva. */
export interface CalculoDePreco {
  calcularValorAluguel(periodo: Periodo, precos: Precos): number;
  horasCobradas(periodo: Periodo): number;
}
