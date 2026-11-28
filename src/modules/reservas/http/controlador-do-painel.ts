import type { PerfilSessao } from "../../../shared/db/sessao.ts";
import { PerfisPermitidos } from "../../../shared/http/perfis-permitidos.ts";
import { Resposta } from "../../../shared/http/resposta.ts";
import type { PainelDeReservas } from "../application/painel-de-reservas.ts";

export type DependenciasDoControlador = {
  // Valida o token e a conta (401). O módulo contas entrega a de verdade; o teste entrega uma de mentira.
  exigirSessao: (request: Request) => Promise<{ usuarioId: string; perfil: PerfilSessao }>;
  painel: Pick<PainelDeReservas, "listar">;
};

// O painel mostra dados que mudam na hora (uma retirada acabou de acontecer), então nada disto
// pode ficar em cache.
const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

// A porta HTTP do painel (rota 25). Primeiro a sessão (401), depois o perfil (403: só OPERADOR e
// ADMIN), e só então a query e o banco. Qualquer erro vira a resposta do contrato; o inesperado vira
// 500 genérico.
export class ControladorDoPainel {
  readonly #exigirSessao: DependenciasDoControlador["exigirSessao"];
  readonly #painel: DependenciasDoControlador["painel"];
  readonly #soEquipe = new PerfisPermitidos("OPERADOR", "ADMIN");

  constructor(deps: DependenciasDoControlador) {
    this.#exigirSessao = deps.exigirSessao;
    this.#painel = deps.painel;
  }

  // GET /api/admin/reservas?status=&data=
  async listar(request: Request): Promise<Response> {
    try {
      const sessao = this.#soEquipe.exigir(await this.#exigirSessao(request));
      const consulta = new URL(request.url).searchParams;
      const reservas = await this.#painel.listar(sessao, {
        status: consulta.get("status"),
        data: consulta.get("data"),
      });
      return Resposta.ok(reservas, SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }
}
