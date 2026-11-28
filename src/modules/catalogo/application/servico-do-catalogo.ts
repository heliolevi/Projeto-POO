import type { SessaoBanco } from "../../../shared/db/sessao.ts";
import { Uuid } from "../../../shared/dominio/uuid.ts";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/http/errors.ts";
import type { BicicletaAdmin, EmpresaPublica, TipoAdmin, TipoPublico } from "../domain/catalogo.ts";
import {
  CodigoDeBicicletaJaExiste,
  NomeDeTipoJaExiste,
  PontoInativo,
  PontoInexistente,
  TipoInexistente,
} from "../domain/erros.ts";
import { TipoBicicleta } from "../domain/tipo-bicicleta.ts";
import { ValidadorDoCatalogo, type ErrosPorCampo } from "../domain/validador-do-catalogo.ts";
import type { RepositorioCatalogo } from "./portas.ts";

const SEM_TIPO = "Tipo de bicicleta não encontrado.";
const SEM_BICICLETA = "Bicicleta não encontrada.";

function aoValidar<T>(resultado: { dados: T } | { erros: ErrosPorCampo }): T {
  if ("erros" in resultado) throw new ValidationError("Dados inválidos.", resultado.erros);
  return resultado.dados;
}

// Os casos de uso do catálogo: o painel do administrador (tipos e bicicletas) e os dados públicos da
// locadora. A validação acontece antes de qualquer consulta, e as falhas que o repositório reconhece no
// banco (nome ou código repetido, tipo ou ponto que não existe) viram a resposta HTTP certa.
export class ServicoDoCatalogo {
  readonly #repositorio: RepositorioCatalogo;
  readonly #validador: ValidadorDoCatalogo;

  constructor(repositorio: RepositorioCatalogo, validador: ValidadorDoCatalogo = new ValidadorDoCatalogo()) {
    this.#repositorio = repositorio;
    this.#validador = validador;
  }

  /** Rota 10 (visitante): só os tipos ativos, sem o campo `ativo`. */
  async listarTiposPublicos(sessao: SessaoBanco): Promise<TipoPublico[]> {
    const tipos = await this.#repositorio.listarTipos(sessao, { apenasAtivos: true });
    return tipos.map((tipo) => new TipoBicicleta(tipo).paraPublico());
  }

  /** Rota 19 (ADMIN): todos os tipos, inclusive os inativos. */
  listarTiposAdmin(sessao: SessaoBanco): Promise<TipoAdmin[]> {
    return this.#repositorio.listarTipos(sessao, { apenasAtivos: false });
  }

  /** Rota 20. */
  async criarTipo(sessao: SessaoBanco, entrada: unknown): Promise<TipoAdmin> {
    const dados = aoValidar(this.#validador.tipo(entrada));
    try {
      return await this.#repositorio.criarTipo(sessao, dados);
    } catch (erro) {
      if (erro instanceof NomeDeTipoJaExiste) throw new ConflictError("Já existe um tipo com este nome.");
      throw erro;
    }
  }

  /** Rota 21: substitui os dados. Um tipo sai do catálogo com `ativo: false`; não há exclusão. */
  async atualizarTipo(sessao: SessaoBanco, id: string, entrada: unknown): Promise<TipoAdmin> {
    // um id que nem é UUID não pode existir: 404 sem gastar uma consulta
    if (!Uuid.ehValido(id)) throw new NotFoundError(SEM_TIPO);
    const dados = aoValidar(this.#validador.tipo(entrada));
    try {
      const tipo = await this.#repositorio.atualizarTipo(sessao, id, dados);
      if (!tipo) throw new NotFoundError(SEM_TIPO);
      return tipo;
    } catch (erro) {
      if (erro instanceof NomeDeTipoJaExiste) throw new ConflictError("Já existe um tipo com este nome.");
      throw erro;
    }
  }

  /** Rota 22. async para que um filtro inválido seja sempre uma promessa rejeitada, como nas outras. */
  async listarBicicletas(sessao: SessaoBanco, parametros: { tipoId?: string | null; status?: string | null }): Promise<BicicletaAdmin[]> {
    return this.#repositorio.listarBicicletas(sessao, aoValidar(this.#validador.filtroDeBicicletas(parametros)));
  }

  /** Rota 23. */
  async criarBicicleta(sessao: SessaoBanco, entrada: unknown): Promise<BicicletaAdmin> {
    const dados = aoValidar(this.#validador.novaBicicleta(entrada));
    try {
      return await this.#repositorio.criarBicicleta(sessao, dados);
    } catch (erro) {
      if (erro instanceof CodigoDeBicicletaJaExiste) throw new ConflictError("Já existe uma bicicleta com este código.");
      if (erro instanceof TipoInexistente) throw new NotFoundError(SEM_TIPO);
      if (erro instanceof PontoInexistente) throw new NotFoundError("Ponto de retirada não encontrado.");
      if (erro instanceof PontoInativo) {
        throw new ConflictError("O ponto de retirada está inativo: reative-o antes de cadastrar bicicletas nele.");
      }
      throw erro;
    }
  }

  /** Rota 24. */
  async atualizarBicicleta(sessao: SessaoBanco, id: string, entrada: unknown): Promise<BicicletaAdmin> {
    if (!Uuid.ehValido(id)) throw new NotFoundError(SEM_BICICLETA);
    const dados = aoValidar(this.#validador.atualizacaoDeBicicleta(entrada));
    const bicicleta = await this.#repositorio.atualizarBicicleta(sessao, id, dados);
    if (!bicicleta) throw new NotFoundError(SEM_BICICLETA);
    return bicicleta;
  }

  /**
   * Rota 9 (visitante): só os dados públicos da locadora e os pontos ativos. A resposta é montada
   * campo a campo: o que o repositório trouxer a mais (CNPJ, conta, datas de controle) não sai.
   */
  async obterEmpresaPublica(sessao: SessaoBanco): Promise<EmpresaPublica> {
    const empresa = await this.#repositorio.obterEmpresaPublica(sessao);
    if (!empresa) throw new NotFoundError("Dados da locadora não cadastrados.");
    return {
      nomeFantasia: empresa.nomeFantasia,
      telefone: empresa.telefone,
      email: empresa.email,
      pontos: empresa.pontos
        .filter((p) => p.ativo)
        .map((p) => ({
          id: p.id,
          nome: p.nome,
          logradouro: p.logradouro,
          numero: p.numero,
          complemento: p.complemento,
          bairro: p.bairro,
          cep: p.cep,
          cidade: p.cidade,
          uf: p.uf,
          telefone: p.telefone,
          horarios: p.horarios.map((h) => ({ diaSemana: h.diaSemana, abre: h.abre, fecha: h.fecha })),
        })),
    };
  }
}
