import { ValidadorDePeriodo } from "../../../shared/dominio/validador-de-periodo.ts";
import { ValidationError } from "../../../shared/http/errors.ts";
import { RecomendacaoService, type Recomendacao } from "../domain/recomendacao.ts";
import type { CalculoDePreco, DisponibilidadeDeTipos, PerfisDosClientes, SessaoCliente } from "./portas.ts";

export type RespostaRecomendacao = {
  periodo: { inicio: string; fim: string; horas: number };
  resultados: Recomendacao[];
};

export type DependenciasDaBusca = {
  perfis: PerfisDosClientes;
  disponibilidade: DisponibilidadeDeTipos;
  preco: CalculoDePreco;
  servico?: Pick<RecomendacaoService, "recomendar">;
  validador?: Pick<ValidadorDePeriodo, "validar">;
  /** O relógio: os testes entregam um fixo. */
  agora: () => Date;
};

// GET /api/recomendacao (rota 11): os tipos com unidade livre no período, do mais ao menos
// adequado ao cliente. Lista vazia não é erro: significa que nada está livre no período.
export class BuscaDeRecomendacoes {
  readonly #deps: DependenciasDaBusca;
  readonly #servico: Pick<RecomendacaoService, "recomendar">;
  readonly #validador: Pick<ValidadorDePeriodo, "validar">;

  constructor(deps: DependenciasDaBusca) {
    this.#deps = deps;
    this.#servico = deps.servico ?? new RecomendacaoService();
    this.#validador = deps.validador ?? new ValidadorDePeriodo();
  }

  async buscar(
    sessao: SessaoCliente,
    parametros: { inicio?: unknown; fim?: unknown; atividade?: unknown },
  ): Promise<RespostaRecomendacao> {
    // valida antes de gastar consultas: um pedido inválido não toca o banco
    const validado = this.#validador.validar(parametros, this.#deps.agora());
    if ("erros" in validado) throw new ValidationError("Dados inválidos.", validado.erros);
    const { inicio, fim, atividade } = validado.dados;
    const periodo = { inicio, fim };

    const perfil = await this.#deps.perfis.consultar(sessao.usuarioId);
    const tipos = await this.#deps.disponibilidade.tiposComUnidadesLivres(sessao, inicio, fim);
    const resultados = this.#servico.recomendar(
      {
        alturaCm: perfil.alturaCm,
        experiencia: perfil.experiencia,
        // a atividade da busca sobrepõe a do perfil
        atividade: atividade ?? perfil.atividade,
      },
      tipos,
      (tipo) => this.#deps.preco.calcularValorAluguel(periodo, tipo),
    );

    return {
      periodo: {
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        horas: this.#deps.preco.horasCobradas(periodo),
      },
      resultados,
    };
  }
}
