import { PerfisPermitidos } from "../../../shared/http/perfis-permitidos.ts";
import { LeitorDeCorpo } from "../../../shared/http/leitor-de-corpo.ts";
import { Resposta } from "../../../shared/http/resposta.ts";
import { UnauthorizedError } from "../../../shared/http/errors.ts";
import type { PagarReservaService } from "../application/pagar-reserva.ts";
import { AssinaturaInvalida, type LeitorDeAviso, type SessaoCliente } from "../application/portas.ts";

// Os avisos da Stripe são pequenos; 64 KiB dá folga sem abrir espaço para abuso.
export const LIMITE_CORPO_WEBHOOK_BYTES = 64 * 1024;

// 10 cobranças por hora por usuário (contrato, rota 16). O limite é conferido pelo caso de uso, só
// quando uma cobrança nova vai ser criada (reabrir a tela não conta); a regra mora aqui, junto da
// rota, e a ligação do módulo a entrega ao caso de uso.
export const LIMITE_PAGAMENTOS_POR_USUARIO = { max: 10, janelaSegundos: 60 * 60 };

const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

export type DependenciasDoControlador = {
  /** Valida o token e a conta (401). O módulo contas entrega a de verdade; o teste entrega uma de mentira. */
  exigirSessao: (request: Request) => Promise<{ usuarioId: string; perfil: "CLIENTE" | "OPERADOR" | "ADMIN" }>;
  pagamentos: Pick<PagarReservaService, "iniciar" | "consultarStatus" | "processarAviso">;
  /** Confere a assinatura do webhook e traduz o evento. */
  avisos: LeitorDeAviso;
};

// A porta HTTP dos pagamentos (rotas 16, 17 e 18). As rotas 16 e 17 são do CLIENTE dono da reserva: 401
// sem sessão válida, 403 para a equipe. A 18 é o webhook da Stripe: sem token de usuário, a
// autenticação é a assinatura.
export class ControladorDePagamentos {
  readonly #deps: DependenciasDoControlador;
  readonly #soCliente = new PerfisPermitidos("CLIENTE");
  readonly #leitor = new LeitorDeCorpo();
  readonly #leitorDoWebhook = new LeitorDeCorpo(LIMITE_CORPO_WEBHOOK_BYTES);

  constructor(deps: DependenciasDoControlador) {
    this.#deps = deps;
  }

  async #sessaoDoCliente(request: Request): Promise<SessaoCliente> {
    return this.#soCliente.exigir(await this.#deps.exigirSessao(request)) as SessaoCliente;
  }

  /** POST /api/pagamentos (rota 16): 201 com a cobrança nova, 200 se reaproveitou o Pix pendente. */
  async criar(request: Request): Promise<Response> {
    try {
      const sessao = await this.#sessaoDoCliente(request);
      const { cobranca, criada } = await this.#deps.pagamentos.iniciar(sessao, await this.#leitor.lerJson(request));
      return criada ? Resposta.criada(cobranca, SEM_CACHE) : Resposta.ok(cobranca, SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  /**
   * GET /api/pagamentos/{reservaId}/status (rota 17). Sem limite de tentativas: a tela consulta a cada 3
   * segundos enquanto o Pix está aberto.
   */
  async consultarStatus(request: Request, reservaId: string): Promise<Response> {
    try {
      const sessao = await this.#sessaoDoCliente(request);
      return Resposta.ok(await this.#deps.pagamentos.consultarStatus(sessao, reservaId), SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }

  /**
   * POST /api/pagamentos/webhook (rota 18): aviso da Stripe. Responde 200 também para eventos que não
   * interessam. A assinatura é conferida sobre o texto cru do corpo, antes de qualquer outra coisa.
   */
  async receberAviso(request: Request): Promise<Response> {
    try {
      const corpo = await this.#leitorDoWebhook.lerTexto(request);
      let aviso;
      try {
        aviso = this.#deps.avisos.ler(corpo, request.headers.get("stripe-signature"));
      } catch (erro) {
        if (erro instanceof AssinaturaInvalida) throw new UnauthorizedError(erro.message);
        throw erro;
      }
      const resultado = aviso ? await this.#deps.pagamentos.processarAviso(aviso.idExterno, aviso.situacao) : "ignorado";
      return Resposta.ok({ recebido: true, resultado }, SEM_CACHE);
    } catch (erro) {
      return Resposta.deErro(erro);
    }
  }
}
