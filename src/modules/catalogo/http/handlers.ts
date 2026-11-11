import { exigirPerfil, exigirSessao } from "@/modules/contas";
import { VISITANTE } from "@/shared/db/sessao";
import { lerJson } from "@/shared/http/json";
import { created, errorResponse, ok } from "@/shared/http/response";
import { criarCatalogo } from "../application/catalogo";
import { repositorioCatalogo } from "../infrastructure/repositorio-catalogo";

const catalogo = criarCatalogo(repositorioCatalogo);

// O painel mostra dados que mudam na hora (um tipo inativado some do catálogo), então nada disto
// pode ficar em cache.
const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

// Rotas do painel: primeiro a sessão (401), depois o perfil (403). Só ADMIN mexe no catálogo.
async function sessaoAdmin(request: Request) {
  return exigirPerfil(await exigirSessao(request), "ADMIN");
}

// GET /api/catalogo/tipos (rota 10): público, só os tipos ativos.
export async function getTiposPublicos() {
  try {
    return ok(await catalogo.listarTiposPublicos(VISITANTE), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

// GET /api/admin/tipos (rota 19)
export async function getAdminTipos(request: Request) {
  try {
    return ok(await catalogo.listarTiposAdmin(await sessaoAdmin(request)), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

// POST /api/admin/tipos (rota 20)
export async function postAdminTipos(request: Request) {
  try {
    const sessao = await sessaoAdmin(request);
    return created(await catalogo.criarTipo(sessao, await lerJson(request)), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

// PUT /api/admin/tipos/{id} (rota 21)
export async function putAdminTipo(request: Request, id: string) {
  try {
    const sessao = await sessaoAdmin(request);
    return ok(await catalogo.atualizarTipo(sessao, id, await lerJson(request)), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

// GET /api/admin/bicicletas (rota 22), com os filtros opcionais tipoId e status
export async function getAdminBicicletas(request: Request) {
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
export async function postAdminBicicletas(request: Request) {
  try {
    const sessao = await sessaoAdmin(request);
    return created(await catalogo.criarBicicleta(sessao, await lerJson(request)), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

// PATCH /api/admin/bicicletas/{id} (rota 24)
export async function patchAdminBicicleta(request: Request, id: string) {
  try {
    const sessao = await sessaoAdmin(request);
    return ok(await catalogo.atualizarBicicleta(sessao, id, await lerJson(request)), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}
