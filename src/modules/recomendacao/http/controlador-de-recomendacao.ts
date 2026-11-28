import { ClienteDaRequisicao } from "../../../shared/http/cliente-da-requisicao.ts";
import { PerfisPermitidos } from "../../../shared/http/perfis-permitidos.ts";
import { Resposta } from "../../../shared/http/resposta.ts";
import type { BuscaDeRecomendacoes } from "../application/busca-de-recomendacoes.ts";
import type { LimiteDeBuscas, SessaoCliente } from "../application/portas.ts";

// Cada busca faz uma consulta com várias subconsultas. O limite de 60 por minuto vale por
// USUÁRIO: atrás de um mesmo NAT (um Wi-Fi da loja, uma operadora) várias pessoas dividem o IP, e
// uma delas não deve travar as outras. O limite por IP é bem mais folgado e só barra quem abre
// muitas contas para fugir do limite por usuário.
export const LIMITE_BUSCAS_POR_USUARIO = { max: 60, janelaSegundos: 60 };
export const LIMITE_BUSCAS_POR_IP = { max: 300, janelaSegundos: 60 };

const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

export type DependenciasDoControlador = {
  /** Valida o token e a conta (401). O módulo contas entrega a de verdade; o teste entrega uma de mentira. */
  exigirSessao: (request: Request) => Promise<{ usuarioId: string; perfil: "CLIENTE" | "OPERADOR" | "ADMIN" }>;
  limite: LimiteDeBuscas;
  busca: Pick<BuscaDeRecomendacoes, "buscar">;
};

// A porta HTTP da recomendação (rota 11): só CLIENTE. A ordem é sessão (401), perfil (403), depois os
// limites (429) e só então o banco.
export class ControladorDeRecomendacao {
  readonly #deps: DependenciasDoControlador;
  readonly #soCliente = new PerfisPermitidos("CLIENTE");

  constructor(deps: DependenciasDoControlador) {
    this.#deps = deps;
  }

  /** GET /api/recomendacao?inicio=&fim=&atividade= */
  async recomendar(request: Request): Promise<Response> {
    try {
      const sessao = this.#soCliente.exigir(await this.#deps.exigirSessao(request)) as SessaoCliente;
      await this.#deps.limite.exigirDentroDoLimite(`recomendacao:usuario:${sessao.usuarioId}`, LIMITE_BUSCAS_POR_USUARIO);
      await this.#deps.limite.exigirDentroDoLimite(
        `recomendacao:ip:${new ClienteDaRequisicao(request.headers).ip.slice(0, 64)}`,
        LIMITE_BUSCAS_POR_IP,
      );

      const { searchParams } = new URL(request.url);
      const resposta = await this.#deps.busca.buscar(sessao, {
        inicio: searchParams.get("inicio"),
        fim: searchParams.get("fim"),
        atividade: searchParams.get("atividade"),
      });
      return Resposta.ok(resposta, SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }
}
