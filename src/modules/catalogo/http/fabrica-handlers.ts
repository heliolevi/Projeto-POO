import { VISITANTE, type PerfilSessao } from "../../../shared/db/sessao.ts";
import { lerJson } from "../../../shared/http/json.ts";
import { exigirPerfil } from "../../../shared/http/perfil.ts";
import { created, errorResponse, ok } from "../../../shared/http/response.ts";
import type { criarCatalogo } from "../application/catalogo.ts";

// Os handlers do catálogo, com as dependências injetadas. Ficam separados de handlers.ts (que liga
// o módulo contas e o banco) para os testes provarem, com o exigirPerfil de verdade, que cada rota
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

export function criarHandlersCatalogo({ exigirSessao, catalogo }: DependenciasHandlers) {
  // Rotas do painel: primeiro a sessão (401), depois o perfil (403), e só então o corpo e o banco.
  // Só ADMIN mexe no catálogo.
  async function sessaoAdmin(request: Request) {
    return exigirPerfil(await exigirSessao(request), "ADMIN");
  }

  // GET /api/catalogo/tipos (rota 10): público, só os tipos ativos. Ignora qualquer token.
  async function getTiposPublicos() {
    try {
      return ok(await catalogo.listarTiposPublicos(VISITANTE), SEM_CACHE);
    } catch (erro) {
      return errorResponse(erro);
    }
  }

  // GET /api/admin/tipos (rota 19)
  async function getAdminTipos(request: Request) {
    try {
      return ok(await catalogo.listarTiposAdmin(await sessaoAdmin(request)), SEM_CACHE);
    } catch (erro) {
      return errorResponse(erro);
    }
  }

  // POST /api/admin/tipos (rota 20)
  async function postAdminTipos(request: Request) {
    try {
      const sessao = await sessaoAdmin(request);
      return created(await catalogo.criarTipo(sessao, await lerJson(request)), SEM_CACHE);
    } catch (erro) {
      return errorResponse(erro);
    }
  }

  // PUT /api/admin/tipos/{id} (rota 21)
  async function putAdminTipo(request: Request, id: string) {
    try {
      const sessao = await sessaoAdmin(request);
      return ok(await catalogo.atualizarTipo(sessao, id, await lerJson(request)), SEM_CACHE);
    } catch (erro) {
      return errorResponse(erro);
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
      return ok(lista, SEM_CACHE);
    } catch (erro) {
      return errorResponse(erro);
    }
  }

  // POST /api/admin/bicicletas (rota 23)
  async function postAdminBicicletas(request: Request) {
    try {
      const sessao = await sessaoAdmin(request);
      return created(await catalogo.criarBicicleta(sessao, await lerJson(request)), SEM_CACHE);
    } catch (erro) {
      return errorResponse(erro);
    }
  }

  // PATCH /api/admin/bicicletas/{id} (rota 24)
  async function patchAdminBicicleta(request: Request, id: string) {
    try {
      const sessao = await sessaoAdmin(request);
      return ok(await catalogo.atualizarBicicleta(sessao, id, await lerJson(request)), SEM_CACHE);
    } catch (erro) {
      return errorResponse(erro);
    }
  }

  return {
    getTiposPublicos,
    getAdminTipos,
    postAdminTipos,
    putAdminTipo,
    getAdminBicicletas,
    postAdminBicicletas,
    patchAdminBicicleta,
  };
}
