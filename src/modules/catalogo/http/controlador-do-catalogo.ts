import { VISITANTE, type PerfilSessao } from "../../../shared/db/sessao.ts";
import { LeitorDeCorpo } from "../../../shared/http/leitor-de-corpo.ts";
import { PerfisPermitidos } from "../../../shared/http/perfis-permitidos.ts";
import { Resposta } from "../../../shared/http/resposta.ts";
import type { ServicoDoCatalogo } from "../application/servico-do-catalogo.ts";

export type DependenciasDoControlador = {
  /** Valida o token e a conta (401). O módulo contas entrega a de verdade; o teste entrega uma de mentira. */
  exigirSessao: (request: Request) => Promise<{ usuarioId: string; perfil: PerfilSessao }>;
  catalogo: ServicoDoCatalogo;
  leitor?: Pick<LeitorDeCorpo, "lerJson">;
};

// O painel mostra dados que mudam na hora (um tipo inativado some do catálogo), então nada disto
// pode ficar em cache.
const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

// A porta HTTP do catálogo (rotas 9, 10 e 19 a 24). Fica separada de handlers.ts (que liga o módulo
// contas e o banco) para os testes provarem, com o PerfisPermitidos de verdade, que cada rota do painel
// exige sessão (401) e perfil ADMIN (403) antes de tocar o catálogo. As rotas 9 e 10 são públicas.
export class ControladorDoCatalogo {
  readonly #exigirSessao: DependenciasDoControlador["exigirSessao"];
  readonly #catalogo: ServicoDoCatalogo;
  readonly #leitor: Pick<LeitorDeCorpo, "lerJson">;
  readonly #soAdmin = new PerfisPermitidos("ADMIN");

  constructor(deps: DependenciasDoControlador) {
    this.#exigirSessao = deps.exigirSessao;
    this.#catalogo = deps.catalogo;
    this.#leitor = deps.leitor ?? new LeitorDeCorpo();
  }

  // Rotas do painel: primeiro a sessão (401), depois o perfil (403), e só então o corpo e o banco.
  // Só ADMIN mexe no catálogo.
  async #sessaoAdmin(request: Request) {
    return this.#soAdmin.exigir(await this.#exigirSessao(request));
  }

  /** GET /api/empresa (rota 9): público, só os dados públicos da locadora e os pontos ativos. Ignora qualquer token. */
  async empresaPublica(): Promise<Response> {
    try {
      return Resposta.ok(await this.#catalogo.obterEmpresaPublica(VISITANTE), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  /** GET /api/catalogo/tipos (rota 10): público, só os tipos ativos. Ignora qualquer token. */
  async tiposPublicos(): Promise<Response> {
    try {
      return Resposta.ok(await this.#catalogo.listarTiposPublicos(VISITANTE), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  /** GET /api/admin/tipos (rota 19). */
  async tiposAdmin(request: Request): Promise<Response> {
    try {
      return Resposta.ok(await this.#catalogo.listarTiposAdmin(await this.#sessaoAdmin(request)), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  /** POST /api/admin/tipos (rota 20). */
  async criarTipo(request: Request): Promise<Response> {
    try {
      const sessao = await this.#sessaoAdmin(request);
      return Resposta.criada(await this.#catalogo.criarTipo(sessao, await this.#leitor.lerJson(request)), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  /** PUT /api/admin/tipos/{id} (rota 21). */
  async atualizarTipo(request: Request, id: string): Promise<Response> {
    try {
      const sessao = await this.#sessaoAdmin(request);
      return Resposta.ok(await this.#catalogo.atualizarTipo(sessao, id, await this.#leitor.lerJson(request)), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  /** GET /api/admin/bicicletas (rota 22), com os filtros opcionais tipoId e status. */
  async bicicletasAdmin(request: Request): Promise<Response> {
    try {
      const sessao = await this.#sessaoAdmin(request);
      const { searchParams } = new URL(request.url);
      const lista = await this.#catalogo.listarBicicletas(sessao, {
        tipoId: searchParams.get("tipoId"),
        status: searchParams.get("status"),
      });
      return Resposta.ok(lista, SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  /** POST /api/admin/bicicletas (rota 23). */
  async criarBicicleta(request: Request): Promise<Response> {
    try {
      const sessao = await this.#sessaoAdmin(request);
      return Resposta.criada(await this.#catalogo.criarBicicleta(sessao, await this.#leitor.lerJson(request)), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  /** PATCH /api/admin/bicicletas/{id} (rota 24). */
  async atualizarBicicleta(request: Request, id: string): Promise<Response> {
    try {
      const sessao = await this.#sessaoAdmin(request);
      return Resposta.ok(await this.#catalogo.atualizarBicicleta(sessao, id, await this.#leitor.lerJson(request)), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }
}
