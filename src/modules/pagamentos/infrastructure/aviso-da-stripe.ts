import Stripe from "stripe";
import { PagamentoIndisponivelError } from "../../../shared/http/errors.ts";
import {
  AssinaturaInvalida,
  type AvisoDoGateway,
  type LeitorDeAviso,
  type SituacaoNoGateway,
} from "../application/portas.ts";
import { TraducaoDaStripe } from "./traducao-da-stripe.ts";

// Lê o webhook da Stripe: confere a assinatura do aviso (cabeçalho stripe-signature) com o segredo
// (STRIPE_WEBHOOK_SECRET) e traduz o evento. O segredo entra pelo construtor como função, lida a cada
// aviso. Sem segredo, o webhook fica indisponível (502), nunca aberto. Sem assinatura válida, lança
// AssinaturaInvalida (a rota responde 401). O corpo precisa ser o texto cru, do jeito que chegou.
export class LeitorDeAvisoDaStripe implements LeitorDeAviso {
  // Eventos do webhook que interessam: o resto é ignorado (responde 200 para a Stripe não reenviar).
  static readonly #EVENTOS: Readonly<Record<string, SituacaoNoGateway>> = {
    "payment_intent.succeeded": "aprovado",
    "payment_intent.payment_failed": "recusado",
    "payment_intent.canceled": "expirado",
  };

  /** O do app: o segredo vem de STRIPE_WEBHOOK_SECRET. */
  static readonly padrao = new LeitorDeAvisoDaStripe(() => process.env.STRIPE_WEBHOOK_SECRET);

  readonly #segredo: () => string | undefined;

  constructor(segredo: () => string | undefined) {
    this.#segredo = segredo;
  }

  ler(corpo: string, assinatura: string | null): AvisoDoGateway | null {
    const segredo = this.#segredo()?.trim();
    if (!segredo) throw new PagamentoIndisponivelError("O webhook de pagamento não está configurado neste ambiente.");
    if (!assinatura) throw new AssinaturaInvalida("Aviso sem assinatura.");
    let evento: Stripe.Event;
    try {
      // estático: conferir a assinatura só precisa do segredo do webhook, não da chave secreta
      evento = Stripe.webhooks.constructEvent(corpo, assinatura, segredo);
    } catch {
      throw new AssinaturaInvalida("Assinatura do aviso inválida.");
    }
    const situacaoDoEvento = LeitorDeAvisoDaStripe.#EVENTOS[evento.type];
    if (!situacaoDoEvento) return null;
    const pi = evento.data.object as Stripe.PaymentIntent;
    if (!pi?.id?.startsWith("pi_")) return null;
    // payment_failed de um Pix vencido conta como expirado
    const situacao =
      situacaoDoEvento === "recusado" && pi.last_payment_error?.code === TraducaoDaStripe.TENTATIVA_EXPIRADA
        ? "expirado"
        : situacaoDoEvento;
    return { idExterno: pi.id, situacao };
  }
}
