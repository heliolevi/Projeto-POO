import { VISITANTE, type PerfilSessao } from "../../../shared/db/sessao.ts";
import { LeitorDeCorpo } from "../../../shared/http/leitor-de-corpo.ts";
import { PerfisPermitidos } from "../../../shared/http/perfis-permitidos.ts";
import { Resposta } from "../../../shared/http/resposta.ts";
import type { criarCatalogo } from "../application/catalogo.ts";

// Os handlers do catálogo, com as dependências injetadas. Ficam separados de handlers.ts (que liga
// o módulo contas e o banco) para os testes provarem, com o PerfisPermitidos de verdade, que cada rota
// do painel exige sessão (401) e perfil ADMIN (403) antes de tocar o catálogo.
export type Catalogo = ReturnType<typeof criarCatalogo>;

export type DependenciasHandlers = {
  // Valida o token e a conta (401). O módulo contas entrega a de verdade; o teste entrega uma de mentira.
  exigirSessao: (request: Request) => Promise<{ usuarioId: string; perfil: PerfilSessao }>;
  catalogo: Catalogo;
};

// O painel mostra dados que mudam na hora (um tipo inativado some do catálogo), então nada disto
// pode ficar em cache.
const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

const leitor = new LeitorDeCorpo();
const soAdmin = new PerfisPermitidos("ADMIN");

export function criarHandlersCatalogo({ exigirSessao, catalogo }: DependenciasHandlers) {
  // Rotas do painel: primeiro a sessão (401), depois o perfil (403), e só então o corpo e o banco.
  // Só ADMIN mexe no catálogo.
  async function sessaoAdmin(request: Request) {
    return soAdmin.exigir(await exigirSessao(request));
  }

  // GET /api/empresa (rota 9): público, só os dados públicos da locadora e os pontos ativos.
  // Ignora qualquer token.
  async function getEmpresaPublica() {
    try {
      return Resposta.ok(await catalogo.obterEmpresaPublica(VISITANTE), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  // GET /api/catalogo/tipos (rota 10): público, só os tipos ativos. Ignora qualquer token.
  async function getTiposPublicos() {
    try {
      return Resposta.ok(await catalogo.listarTiposPublicos(VISITANTE), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  // GET /api/admin/tipos (rota 19)
  async function getAdminTipos(request: Request) {
    try {
      return Resposta.ok(await catalogo.listarTiposAdmin(await sessaoAdmin(request)), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  // POST /api/admin/tipos (rota 20)
  async function postAdminTipos(request: Request) {
    try {
      const sessao = await sessaoAdmin(request);
      return Resposta.criada(await catalogo.criarTipo(sessao, await leitor.lerJson(request)), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  // PUT /api/admin/tipos/{id} (rota 21)
  async function putAdminTipo(request: Request, id: string) {
    try {
      const sessao = await sessaoAdmin(request);
      return Resposta.ok(await catalogo.atualizarTipo(sessao, id, await leitor.lerJson(request)), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  // GET /api/admin/bicicletas (rota 22), com os filtros opcionais tipoId e status
  async function getAdminBicicletas(request: Request) {
    try {
      const sessao = await sessaoAdmin(request);
      const { searchParams } = new URL(request.url);
      const lista = await catalogo.listarBicicletas(sessao, {
        tipoId: searchParams.get("tipoId"),
        status: searchParams.get("status"),
      });
      return Resposta.ok(lista, SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  // POST /api/admin/bicicletas (rota 23)
  async function postAdminBicicletas(request: Request) {
    try {
      const sessao = await sessaoAdmin(request);
      return Resposta.criada(await catalogo.criarBicicleta(sessao, await leitor.lerJson(request)), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  // PATCH /api/admin/bicicletas/{id} (rota 24)
  async function patchAdminBicicleta(request: Request, id: string) {
    try {
      const sessao = await sessaoAdmin(request);
      return Resposta.ok(await catalogo.atualizarBicicleta(sessao, id, await leitor.lerJson(request)), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  return {
    getEmpresaPublica,
    getTiposPublicos,
    getAdminTipos,
    postAdminTipos,
    putAdminTipo,
    getAdminBicicletas,
    postAdminBicicletas,
    patchAdminBicicleta,
  };
}
