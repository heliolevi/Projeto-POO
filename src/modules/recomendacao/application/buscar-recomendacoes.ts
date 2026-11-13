import type { SessaoBanco } from "../../../shared/db/sessao.ts";
import { ValidationError } from "../../../shared/http/errors.ts";
import { validarBusca } from "../../../shared/dominio/periodo.ts";
import type { Atividade, Experiencia } from "../domain/perfil.ts";
import { recomendar, type Recomendacao, type TipoCandidato } from "../domain/recomendacao.ts";

export type Periodo = { inicio: Date; fim: Date };
export type Precos = { precoHoraCentavos: number; precoDiaCentavos: number };

// Perfil do cliente como a conta o guarda: a atividade é a preferida, que a busca pode trocar.
export type PerfilDoCliente = {
  alturaCm: number | null;
  experiencia: Experiencia | null;
  atividade: Atividade | null;
};

// Quem faz a busca: o cliente logado, como o exigirPerfil devolve. A mesma sessão vai para o
// comSessao, então as políticas de RLS valem. Por isso o caso de uso recebe a sessão a cada busca
// e pode ser criado uma vez só, no escopo do módulo.
export type SessaoCliente = SessaoBanco & { perfil: "CLIENTE"; usuarioId: string };

export type DependenciasBusca = {
  buscarPerfil: (usuarioId: string) => Promise<PerfilDoCliente>;
  // tipos ativos com a contagem de unidades livres no período (sem reserva ativa sobreposta)
  buscarTipos: (sessao: SessaoCliente, inicio: Date, fim: Date) => Promise<TipoCandidato[]>;
  // a regra de preço mora em src/modules/reservas e é a mesma da criação da reserva
  calcularValorAluguel: (periodo: Periodo, precos: Precos) => number;
  horasCobradas: (periodo: Periodo) => number;
  agora: () => Date;
};

export type RespostaRecomendacao = {
  periodo: { inicio: string; fim: string; horas: number };
  resultados: Recomendacao[];
};

// GET /api/recomendacao (rota 11): os tipos com unidade livre no período, do mais ao menos
// adequado ao cliente. Lista vazia não é erro: significa que nada está livre no período.
export function criarBuscarRecomendacoes(deps: DependenciasBusca) {
  return async function buscarRecomendacoes(
    sessao: SessaoCliente,
    parametros: { inicio?: unknown; fim?: unknown; atividade?: unknown },
  ): Promise<RespostaRecomendacao> {
    // valida antes de gastar consultas: um pedido inválido não toca o banco
    const validado = validarBusca(parametros, deps.agora());
    if ("erros" in validado) throw new ValidationError("Dados inválidos.", validado.erros);
    const { inicio, fim, atividade } = validado.dados;
    const periodo = { inicio, fim };

    const perfil = await deps.buscarPerfil(sessao.usuarioId);
    const tipos = await deps.buscarTipos(sessao, inicio, fim);
    const resultados = recomendar(
      {
        alturaCm: perfil.alturaCm,
        experiencia: perfil.experiencia,
        // a atividade da busca sobrepõe a do perfil
        atividade: atividade ?? perfil.atividade,
      },
      tipos,
      (tipo) => deps.calcularValorAluguel(periodo, tipo),
    );

    return {
      periodo: {
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        horas: deps.horasCobradas(periodo),
      },
      resultados,
    };
  };
}
