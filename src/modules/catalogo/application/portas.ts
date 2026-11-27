import type { SessaoBanco } from "../../../shared/db/sessao.ts";
import type { BicicletaAdmin, EmpresaDoRepositorio, TipoAdmin } from "../domain/catalogo.ts";
import type {
  DadosAtualizacaoBicicleta,
  DadosNovaBicicleta,
  DadosTipo,
  FiltroBicicletas,
} from "../domain/validador-do-catalogo.ts";

/**
 * O que o serviço do catálogo precisa do banco. A implementação real (RepositorioDoCatalogo) roda cada
 * consulta dentro de comSessao, com SQL parametrizado; os testes entregam uma de mentira.
 */
export interface RepositorioCatalogo {
  /** null quando a locadora ainda não foi cadastrada. */
  obterEmpresaPublica(sessao: SessaoBanco): Promise<EmpresaDoRepositorio | null>;
  listarTipos(sessao: SessaoBanco, filtro: { apenasAtivos: boolean }): Promise<TipoAdmin[]>;
  criarTipo(sessao: SessaoBanco, dados: DadosTipo): Promise<TipoAdmin>;
  /** null quando o id não existe. */
  atualizarTipo(sessao: SessaoBanco, id: string, dados: DadosTipo): Promise<TipoAdmin | null>;
  listarBicicletas(sessao: SessaoBanco, filtro: FiltroBicicletas): Promise<BicicletaAdmin[]>;
  criarBicicleta(sessao: SessaoBanco, dados: DadosNovaBicicleta): Promise<BicicletaAdmin>;
  /** null quando o id não existe. */
  atualizarBicicleta(sessao: SessaoBanco, id: string, dados: DadosAtualizacaoBicicleta): Promise<BicicletaAdmin | null>;
}
