import type { PerfilSessao } from "../../../shared/db/sessao.ts";
import { PerfisPermitidos } from "../../../shared/http/perfis-permitidos.ts";
import { Resposta } from "../../../shared/http/resposta.ts";
import type { LimiteDeReservas, SessaoCliente } from "../application/portas.ts";
import type { ReservaService } from "../application/reserva-service.ts";

// 20 reservas por hora por usuário (contrato, rota 12). Por usuário, e não por IP, porque várias
// pessoas atrás do mesmo NAT dividem o IP.
export const LIMITE_RESERVAS_POR_USUARIO = { max: 20, janelaSegundos: 60 * 60 };

const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

export type DependenciasDoControladorDeReservas = {
  // Valida o token e a conta (401). O módulo contas entrega a de verdade; o teste entrega uma de mentira.
  exigirSessao: (request: Request) => Promise<{ usuarioId: string; perfil: PerfilSessao }>;
  limite: LimiteDeReservas;
  // Só o que o controlador usa do serviço, para o teste entregar um de mentira.
  reservas: Pick<ReservaService, "criarReserva" | "listarReservas" | "buscarReserva" | "cancelarReserva">;
  // Lê o corpo JSON da requisição (o LeitorDeCorpo, com o limite de bytes).
  lerJson: (request: Request) => Promise<unknown>;
};

// A porta HTTP das reservas (rotas 12 a 15). Todas são do CLIENTE: 401 sem sessão válida, 403 para a
// equipe, e só então o limite (na criação) e o banco. Qualquer erro vira a resposta do contrato; o
// inesperado vira 500 genérico.
export class ControladorDeReservas {
  readonly #deps: DependenciasDoControladorDeReservas;
  readonly #soCliente = new PerfisPermitidos("CLIENTE");

  constructor(deps: DependenciasDoControladorDeReservas) {
    this.#deps = deps;
  }

  async #sessaoDoCliente(request: Request): Promise<SessaoCliente> {
    return this.#soCliente.exigir(await this.#deps.exigirSessao(request));
  }

  /** POST /api/reservas (rota 12) */
  async criar(request: Request): Promise<Response> {
    try {
      const sessao = await this.#sessaoDoCliente(request);
      await this.#deps.limite.exigirDentroDoLimite(
        `reservas:usuario:${sessao.usuarioId}`,
        LIMITE_RESERVAS_POR_USUARIO,
      );
      return Resposta.criada(
        await this.#deps.reservas.criarReserva(sessao, await this.#deps.lerJson(request)),
        SEM_CACHE,
      );
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  /** GET /api/reservas (rota 13), com ?status= opcional */
  async listar(request: Request): Promise<Response> {
    try {
      const sessao = await this.#sessaoDoCliente(request);
      const status = new URL(request.url).searchParams.get("status");
      return Resposta.ok(await this.#deps.reservas.listarReservas(sessao, { status }), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  /** GET /api/reservas/{id} (rota 14) */
  async detalhar(request: Request, id: string): Promise<Response> {
    try {
      const sessao = await this.#sessaoDoCliente(request);
      return Resposta.ok(await this.#deps.reservas.buscarReserva(sessao, id), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  /** POST /api/reservas/{id}/cancelar (rota 15). O corpo (`{}`) não é lido: não tem nada a validar. */
  async cancelar(request: Request, id: string): Promise<Response> {
    try {
      const sessao = await this.#sessaoDoCliente(request);
      return Resposta.ok(await this.#deps.reservas.cancelarReserva(sessao, id), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }
}
