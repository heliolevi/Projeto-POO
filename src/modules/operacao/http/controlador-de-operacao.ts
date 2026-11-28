import type { PerfilSessao } from "../../../shared/db/sessao.ts";
import { LeitorDeCorpo } from "../../../shared/http/leitor-de-corpo.ts";
import { PerfisPermitidos } from "../../../shared/http/perfis-permitidos.ts";
import { Resposta } from "../../../shared/http/resposta.ts";
import type { OperacaoService } from "../application/operacao-service.ts";

const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

export type DependenciasDoControlador = {
  /** Valida o token e a conta (401). O módulo contas entrega a de verdade; o teste entrega uma de mentira. */
  exigirSessao: (request: Request) => Promise<{ usuarioId: string; perfil: PerfilSessao }>;
  operacao: Pick<OperacaoService, "registrarRetirada" | "registrarDevolucao">;
  leitor?: Pick<LeitorDeCorpo, "lerJson">;
};

// A porta HTTP da operação (rotas 26 e 27): só a equipe. A ordem é sessão (401), perfil (403), e só
// então o id e o corpo (o corpo só é lido depois de conferir o id) e o banco.
export class ControladorDeOperacao {
  readonly #exigirSessao: DependenciasDoControlador["exigirSessao"];
  readonly #operacao: DependenciasDoControlador["operacao"];
  readonly #leitor: Pick<LeitorDeCorpo, "lerJson">;
  readonly #soEquipe = new PerfisPermitidos("OPERADOR", "ADMIN");

  constructor(deps: DependenciasDoControlador) {
    this.#exigirSessao = deps.exigirSessao;
    this.#operacao = deps.operacao;
    this.#leitor = deps.leitor ?? new LeitorDeCorpo();
  }

  /** POST /api/operacao/reservas/{id}/retirada (rota 26). */
  async retirada(request: Request, id: string): Promise<Response> {
    try {
      const sessao = this.#soEquipe.exigir(await this.#exigirSessao(request));
      return Resposta.ok(
        await this.#operacao.registrarRetirada(sessao, id, () => this.#leitor.lerJson(request)),
        SEM_CACHE,
      );
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  /** POST /api/operacao/reservas/{id}/devolucao (rota 27): devolve a reserva com a unidade, como na retirada. */
  async devolucao(request: Request, id: string): Promise<Response> {
    try {
      const sessao = this.#soEquipe.exigir(await this.#exigirSessao(request));
      return Resposta.ok(
        await this.#operacao.registrarDevolucao(sessao, id, () => this.#leitor.lerJson(request)),
        SEM_CACHE,
      );
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }
}
