import type Stripe from "stripe";
import type { SituacaoNoGateway } from "../application/portas.ts";
import { CodigoPix } from "../domain/codigo-pix.ts";

// O que a Stripe diz, traduzido para o vocabulário do sistema. Só tem método estático: não se cria
// instância. Usada pelo gateway (consulta) e pelo leitor do webhook (aviso), para os dois caminhos
// concordarem sobre o que cada status significa.
export class TraducaoDaStripe {
  /** Código de erro de um Pix que venceu sem pagamento. */
  static readonly TENTATIVA_EXPIRADA = "payment_intent_payment_attempt_expired";

  private constructor() {
    throw new TypeError("TraducaoDaStripe só tem método estático; não se cria instância.");
  }

  // Status do PaymentIntent no vocabulário do sistema. Um Pix que vence sem pagamento volta para
  // requires_payment_method (a tentativa falhou) ou é cancelado.
  static situacaoDoPaymentIntent(
    pi: Pick<Stripe.PaymentIntent, "status" | "last_payment_error">,
  ): SituacaoNoGateway {
    switch (pi.status) {
      case "succeeded":
        return "aprovado";
      case "canceled":
        return "expirado";
      case "requires_payment_method":
        return pi.last_payment_error?.code === TraducaoDaStripe.TENTATIVA_EXPIRADA ? "expirado" : "recusado";
      default:
        // requires_action (QR na tela), processing, requires_confirmation...
        return "pendente";
    }
  }

  // Em produção (livemode), um código que não segue o BR Code não pode ir para o cliente: ele pagaria
  // nada, ou o banco recusaria. Vira 502 (o gateway registra o motivo no log). No modo de teste o
  // código fictício passa, porque é o único que existe ali.
  static exigirCodigoDeVerdadeEmProducao(pi: Pick<Stripe.PaymentIntent, "id" | "livemode">, copiaECola: string): void {
    if (pi.livemode && !CodigoPix.de(copiaECola).pagavelEmBanco) {
      throw new Error(`PaymentIntent ${pi.id} em produção com copia e cola fora do padrão BR Code.`);
    }
  }
}
