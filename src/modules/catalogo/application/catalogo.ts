import type { SessaoBanco } from "../../../shared/db/sessao.ts";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../shared/http/errors.ts";
import {
  paraPublico,
  type BicicletaAdmin,
  type TipoAdmin,
  type TipoPublico,
} from "../domain/catalogo.ts";
import {
  CodigoDeBicicletaJaExiste,
  NomeDeTipoJaExiste,
  PontoInexistente,
  TipoInexistente,
} from "../domain/erros.ts";
import {
  ehUuid,
  validarAtualizacaoBicicleta,
  validarFiltroBicicletas,
  validarNovaBicicleta,
  validarTipo,
  type DadosAtualizacaoBicicleta,
  type DadosNovaBicicleta,
  type DadosTipo,
  type FiltroBicicletas,
} from "../domain/validacao.ts";

// O que o caso de uso precisa do banco. A implementação real (infrastructure) roda cada
// consulta dentro de comSessao, com SQL parametrizado; os testes entregam uma de mentira.
export type RepositorioCatalogo = {
  listarTipos(sessao: SessaoBanco, filtro: { apenasAtivos: boolean }): Promise<TipoAdmin[]>;
  criarTipo(sessao: SessaoBanco, dados: DadosTipo): Promise<TipoAdmin>;
  // null quando o id não existe
  atualizarTipo(sessao: SessaoBanco, id: string, dados: DadosTipo): Promise<TipoAdmin | null>;
  listarBicicletas(sessao: SessaoBanco, filtro: FiltroBicicletas): Promise<BicicletaAdmin[]>;
  criarBicicleta(sessao: SessaoBanco, dados: DadosNovaBicicleta): Promise<BicicletaAdmin>;
  // null quando o id não existe
  atualizarBicicleta(
    sessao: SessaoBanco,
    id: string,
    dados: DadosAtualizacaoBicicleta,
  ): Promise<BicicletaAdmin | null>;
};

function aoValidar<T>(resultado: { dados: T } | { erros: Record<string, string> }): T {
  if ("erros" in resultado) throw new ValidationError("Dados inválidos.", resultado.erros);
  return resultado.dados;
}

const SEM_TIPO = "Tipo de bicicleta não encontrado.";
const SEM_BICICLETA = "Bicicleta não encontrada.";

export function criarCatalogo(repositorio: RepositorioCatalogo) {
  // Rota 10 (visitante): só os tipos ativos, sem o campo `ativo`.
  async function listarTiposPublicos(sessao: SessaoBanco): Promise<TipoPublico[]> {
    const tipos = await repositorio.listarTipos(sessao, { apenasAtivos: true });
    return tipos.map(paraPublico);
  }

  // Rota 19 (ADMIN): todos os tipos, inclusive os inativos.
  function listarTiposAdmin(sessao: SessaoBanco): Promise<TipoAdmin[]> {
    return repositorio.listarTipos(sessao, { apenasAtivos: false });
  }

  async function criarTipo(sessao: SessaoBanco, entrada: unknown): Promise<TipoAdmin> {
    const dados = aoValidar(validarTipo(entrada));
    try {
      return await repositorio.criarTipo(sessao, dados);
    } catch (erro) {
      if (erro instanceof NomeDeTipoJaExiste) throw new ConflictError("Já existe um tipo com este nome.");
      throw erro;
    }
  }

  // Rota 21: substitui os dados. Um tipo sai do catálogo com `ativo: false`; não há exclusão.
  async function atualizarTipo(sessao: SessaoBanco, id: string, entrada: unknown): Promise<TipoAdmin> {
    // um id que nem é UUID não pode existir: 404 sem gastar uma consulta
    if (!ehUuid(id)) throw new NotFoundError(SEM_TIPO);
    const dados = aoValidar(validarTipo(entrada));
    try {
      const tipo = await repositorio.atualizarTipo(sessao, id, dados);
      if (!tipo) throw new NotFoundError(SEM_TIPO);
      return tipo;
    } catch (erro) {
      if (erro instanceof NomeDeTipoJaExiste) throw new ConflictError("Já existe um tipo com este nome.");
      throw erro;
    }
  }

  // async para que um filtro inválido seja sempre uma promessa rejeitada, como nas outras
  async function listarBicicletas(
    sessao: SessaoBanco,
    parametros: { tipoId?: string | null; status?: string | null },
  ): Promise<BicicletaAdmin[]> {
    return repositorio.listarBicicletas(sessao, aoValidar(validarFiltroBicicletas(parametros)));
  }

  async function criarBicicleta(sessao: SessaoBanco, entrada: unknown): Promise<BicicletaAdmin> {
    const dados = aoValidar(validarNovaBicicleta(entrada));
    try {
      return await repositorio.criarBicicleta(sessao, dados);
    } catch (erro) {
      if (erro instanceof CodigoDeBicicletaJaExiste) {
        throw new ConflictError("Já existe uma bicicleta com este código.");
      }
      if (erro instanceof TipoInexistente) throw new NotFoundError(SEM_TIPO);
      if (erro instanceof PontoInexistente) throw new NotFoundError("Ponto de retirada não encontrado.");
      throw erro;
    }
  }

  async function atualizarBicicleta(
    sessao: SessaoBanco,
    id: string,
    entrada: unknown,
  ): Promise<BicicletaAdmin> {
    if (!ehUuid(id)) throw new NotFoundError(SEM_BICICLETA);
    const dados = aoValidar(validarAtualizacaoBicicleta(entrada));
    const bicicleta = await repositorio.atualizarBicicleta(sessao, id, dados);
    if (!bicicleta) throw new NotFoundError(SEM_BICICLETA);
    return bicicleta;
  }

  return {
    listarTiposPublicos,
    listarTiposAdmin,
    criarTipo,
    atualizarTipo,
    listarBicicletas,
    criarBicicleta,
    atualizarBicicleta,
  };
}
