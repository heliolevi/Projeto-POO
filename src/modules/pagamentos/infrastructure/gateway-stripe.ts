import Stripe from "stripe";
import { PagamentoIndisponivelError } from "../../../shared/http/errors.ts";
import type { GatewayPix, NovaCobrancaPix, SituacaoNoGateway } from "../application/portas.ts";
import { TraducaoDaStripe } from "./traducao-da-stripe.ts";

// Meio de pagamento: Stripe, Pix pela API de PaymentIntents (https://docs.stripe.com/payments/pix).
//
// Variáveis de ambiente (nunca no código nem no repositório):
// - STRIPE_SECRET_KEY: chave secreta da conta (sk_test_... no sandbox, sk_live_... em produção).
// - STRIPE_WEBHOOK_SECRET: segredo de assinatura do endpoint do webhook (whsec_...), lido por
//   LeitorDeAvisoDaStripe.
//
// A conta precisa ser do Brasil e ter o Pix ativado em Configurações > Métodos de pagamento.
//
// Teste x produção: com sk_test_ a Stripe devolve um copia e cola FICTÍCIO (nenhum banco paga), e o
// pagamento só se aprova pelo painel de testes da Stripe. Com sk_live_ o código é um BR Code de
// verdade, que qualquer banco paga, e o dinheiro é real. A cobrança diz qual é o caso
// (pix.pagavelEmBanco), e a tela avisa quando o código é de teste.

export type OpcoesDoGatewayStripe = {
  /** A chave secreta, lida a cada uso (assim uma chave trocada vale sem reiniciar). Sem ela: 502. */
  chave?: () => string | undefined;
  /** O fetch que a biblioteca usa para falar com a Stripe. Os testes passam um de mentira (sem rede). */
  fetch?: typeof fetch;
  /** Quantas vezes a biblioteca repete uma chamada que falhou na rede. */
  tentativasDeRede?: number;
  /** Onde vai o detalhe do erro (o cliente só recebe 502 genérico). */
  registrarErro?: (...partes: unknown[]) => void;
};

// O meio de pagamento de verdade: implementa a interface GatewayPix, que é tudo o que os casos de uso
// conhecem (os testes usam outra implementação, em memória). A chave e o fetch entram pelo
// construtor; nada aqui lê o ambiente senão pela função `chave`.
export class GatewayStripe implements GatewayPix {
  static readonly #DESCRICAO = "Aluguel de bicicleta - Bike Ilha Club";

  /** O do app: a chave vem de STRIPE_SECRET_KEY e a rede é a da biblioteca. */
  static readonly padrao = new GatewayStripe();

  readonly #chave: () => string | undefined;
  readonly #fetch: typeof fetch | undefined;
  readonly #tentativasDeRede: number;
  readonly #registrarErro: (...partes: unknown[]) => void;
  // Um cliente da Stripe por instância (refeito se a chave mudar).
  #cliente: { chave: string; stripe: Stripe } | null = null;

  constructor(opcoes: OpcoesDoGatewayStripe = {}) {
    this.#chave = opcoes.chave ?? (() => process.env.STRIPE_SECRET_KEY);
    this.#fetch = opcoes.fetch;
    this.#tentativasDeRede = opcoes.tentativasDeRede ?? 2;
    this.#registrarErro = opcoes.registrarErro ?? ((...partes) => console.error(...partes));
  }

  #stripe(): Stripe {
    const chave = this.#chave()?.trim();
    if (!chave) throw new PagamentoIndisponivelError("O pagamento ainda não está configurado neste ambiente.");
    if (this.#cliente?.chave !== chave) {
      this.#cliente = {
        chave,
        stripe: new Stripe(chave, {
          maxNetworkRetries: this.#tentativasDeRede,
          timeout: 10_000,
          ...(this.#fetch ? { httpClient: Stripe.createFetchHttpClient(this.#fetch) } : {}),
        }),
      };
    }
    return this.#cliente.stripe;
  }

  // Erro da Stripe (rede, chave, Pix não ativado...) vira 502 com mensagem genérica para o cliente; o
  // detalhe vai para o log do servidor.
  async #semVazarErro<T>(acao: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (erro) {
      if (erro instanceof PagamentoIndisponivelError) throw erro;
      const e = erro as { type?: string; code?: string; message?: string };
      this.#registrarErro(`[stripe] falha ao ${acao}:`, e.type ?? "", e.code ?? "", e.message ?? erro);
      throw new PagamentoIndisponivelError();
    }
  }

  async criarCobrancaPix(dados: NovaCobrancaPix): Promise<{ idExterno: string; copiaECola: string }> {
    return this.#semVazarErro("criar a cobrança Pix", async () => {
      const pi = await this.#stripe().paymentIntents.create(
        {
          amount: dados.valorCentavos,
          currency: "brl",
          allowed_payment_method_types: ["pix"],
          payment_method_data: {
            type: "pix",
            billing_details: { name: dados.pagador.nome, email: dados.pagador.email },
          },
          payment_method_options: {
            // o Pix vence junto com o pagamento no sistema (no máximo o prazo da reserva)
            pix: { expires_at: Math.floor(dados.expiraEm.getTime() / 1000) },
          },
          confirm: true,
          description: GatewayStripe.#DESCRICAO,
          metadata: { pagamento_id: dados.pagamentoId, reserva_id: dados.reservaId },
        },
        // a mesma cobrança pedida duas vezes (retentativa de rede) não vira duas na Stripe
        { idempotencyKey: `pagamento-${dados.pagamentoId}` },
      );
      const copiaECola = pi.next_action?.pix_display_qr_code?.data;
      try {
        if (!copiaECola) {
          throw new Error(`PaymentIntent ${pi.id} sem pix_display_qr_code (status ${pi.status}).`);
        }
        TraducaoDaStripe.exigirCodigoDeVerdadeEmProducao(pi, copiaECola);
      } catch (erro) {
        // o PaymentIntent já nasceu confirmado na Stripe: sem um código que dê para mostrar, ele não
        // pode ficar aberto lá (cada nova tentativa cria outro)
        await this.#stripe()
          .paymentIntents.cancel(pi.id, {}, { idempotencyKey: `cancelamento-${pi.id}` })
          .catch((falha: unknown) => this.#registrarErro(`[stripe] falha ao cancelar ${pi.id}:`, falha));
        throw erro;
      }
      return { idExterno: pi.id, copiaECola };
    });
  }

  async consultar(idExterno: string): Promise<SituacaoNoGateway> {
    return this.#semVazarErro("consultar a cobrança", async () =>
      TraducaoDaStripe.situacaoDoPaymentIntent(await this.#stripe().paymentIntents.retrieve(idExterno)),
    );
  }

  async estornar(idExterno: string): Promise<void> {
    await this.#semVazarErro("estornar a cobrança", async () => {
      await this.#stripe().refunds.create(
        { payment_intent: idExterno, reason: "requested_by_customer", metadata: { motivo: "reserva_inativa" } },
        { idempotencyKey: `estorno-${idExterno}` },
      );
    });
  }

  // Cancela um Pix que nasceu na Stripe mas não chegou ao banco (a transação falhou depois de criar).
  // Se ele já tiver sido pago ou cancelado, a Stripe recusa, e o erro vai para o log.
  async cancelar(idExterno: string): Promise<void> {
    await this.#semVazarErro("cancelar a cobrança", async () => {
      await this.#stripe().paymentIntents.cancel(idExterno, {}, { idempotencyKey: `cancelamento-${idExterno}` });
    });
  }
}
