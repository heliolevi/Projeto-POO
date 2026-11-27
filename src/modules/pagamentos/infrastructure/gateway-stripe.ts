import Stripe from "stripe";
import { PagamentoIndisponivelError } from "../../../shared/http/errors.ts";
import { CodigoPix } from "../domain/codigo-pix.ts";
import type { GatewayPix, NovaCobrancaPix, SituacaoNoGateway } from "../application/portas.ts";

// Meio de pagamento: Stripe, Pix pela API de PaymentIntents (https://docs.stripe.com/payments/pix).
//
// Variáveis de ambiente (nunca no código nem no repositório):
// - STRIPE_SECRET_KEY: chave secreta da conta (sk_test_... no sandbox, sk_live_... em produção).
// - STRIPE_WEBHOOK_SECRET: segredo de assinatura do endpoint do webhook (whsec_...).
//
// A conta precisa ser do Brasil e ter o Pix ativado em Configurações > Métodos de pagamento.
//
// Teste x produção: com sk_test_ a Stripe devolve um copia e cola FICTÍCIO (nenhum banco paga), e o
// pagamento só se aprova pelo painel de testes da Stripe. Com sk_live_ o código é um BR Code de
// verdade, que qualquer banco paga, e o dinheiro é real. A cobrança diz qual é o caso
// (pix.pagavelEmBanco), e a tela avisa quando o código é de teste.

const DESCRICAO = "Aluguel de bicicleta - Bike Ilha Club";

function chaveSecreta(): string {
  const chave = process.env.STRIPE_SECRET_KEY?.trim();
  if (!chave) throw new PagamentoIndisponivelError("O pagamento ainda não está configurado neste ambiente.");
  return chave;
}

let cliente: { chave: string; stripe: Stripe } | null = null;

// Um cliente da Stripe por processo (refeito se a chave mudar).
function stripe(): Stripe {
  const chave = chaveSecreta();
  if (cliente?.chave !== chave) {
    cliente = { chave, stripe: new Stripe(chave, { maxNetworkRetries: 2, timeout: 10_000 }) };
  }
  return cliente.stripe;
}

// Erro da Stripe (rede, chave, Pix não ativado...) vira 502 com mensagem genérica para o cliente; o
// detalhe vai para o log do servidor.
async function semVazarErro<T>(acao: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (erro) {
    if (erro instanceof PagamentoIndisponivelError) throw erro;
    const e = erro as { type?: string; code?: string; message?: string };
    console.error(`[stripe] falha ao ${acao}:`, e.type ?? "", e.code ?? "", e.message ?? erro);
    throw new PagamentoIndisponivelError();
  }
}

// Status do PaymentIntent no vocabulário do sistema. Um Pix que vence sem pagamento volta para
// requires_payment_method (a tentativa falhou) ou é cancelado.
export function situacaoDoPaymentIntent(pi: Pick<Stripe.PaymentIntent, "status" | "last_payment_error">): SituacaoNoGateway {
  switch (pi.status) {
    case "succeeded":
      return "aprovado";
    case "canceled":
      return "expirado";
    case "requires_payment_method":
      return pi.last_payment_error?.code === "payment_intent_payment_attempt_expired" ? "expirado" : "recusado";
    default:
      // requires_action (QR na tela), processing, requires_confirmation...
      return "pendente";
  }
}

// Em produção (livemode), um código que não segue o BR Code não pode ir para o cliente: ele pagaria
// nada, ou o banco recusaria. Vira 502 (semVazarErro registra o motivo no log). No modo de teste o
// código fictício passa, porque é o único que existe ali.
export function exigirCodigoDeVerdadeEmProducao(
  pi: Pick<Stripe.PaymentIntent, "id" | "livemode">,
  copiaECola: string,
): void {
  if (pi.livemode && !CodigoPix.de(copiaECola).pagavelEmBanco) {
    throw new Error(`PaymentIntent ${pi.id} em produção com copia e cola fora do padrão BR Code.`);
  }
}

// O meio de pagamento de verdade: implementa a interface GatewayPix, que é tudo o que os casos de uso
// conhecem (os testes usam outra implementação, em memória).
export class GatewayStripe implements GatewayPix {
  async criarCobrancaPix(dados: NovaCobrancaPix): Promise<{ idExterno: string; copiaECola: string }> {
    return semVazarErro("criar a cobrança Pix", async () => {
      const pi = await stripe().paymentIntents.create(
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
          description: DESCRICAO,
          metadata: { pagamento_id: dados.pagamentoId, reserva_id: dados.reservaId },
        },
        // a mesma cobrança pedida duas vezes (retentativa de rede) não vira duas na Stripe
        { idempotencyKey: `pagamento-${dados.pagamentoId}` },
      );
      const copiaECola = pi.next_action?.pix_display_qr_code?.data;
      if (!copiaECola) {
        throw new Error(`PaymentIntent ${pi.id} sem pix_display_qr_code (status ${pi.status}).`);
      }
      exigirCodigoDeVerdadeEmProducao(pi, copiaECola);
      return { idExterno: pi.id, copiaECola };
    });
  }

  async consultar(idExterno: string): Promise<SituacaoNoGateway> {
    return semVazarErro("consultar a cobrança", async () =>
      situacaoDoPaymentIntent(await stripe().paymentIntents.retrieve(idExterno)),
    );
  }

  async estornar(idExterno: string): Promise<void> {
    await semVazarErro("estornar a cobrança", async () => {
      await stripe().refunds.create(
        { payment_intent: idExterno, reason: "requested_by_customer", metadata: { motivo: "reserva_inativa" } },
        { idempotencyKey: `estorno-${idExterno}` },
      );
    });
  }

  // Cancela um Pix que nasceu na Stripe mas não chegou ao banco (a transação falhou depois de criar).
  // Se ele já tiver sido pago ou cancelado, a Stripe recusa, e o erro vai para o log.
  async cancelar(idExterno: string): Promise<void> {
    await semVazarErro("cancelar a cobrança", async () => {
      await stripe().paymentIntents.cancel(idExterno, {}, { idempotencyKey: `cancelamento-${idExterno}` });
    });
  }
}

// Eventos do webhook que interessam: o resto é ignorado (responde 200 para a Stripe não reenviar).
const EVENTOS: Record<string, SituacaoNoGateway> = {
  "payment_intent.succeeded": "aprovado",
  "payment_intent.payment_failed": "recusado",
  "payment_intent.canceled": "expirado",
};

export class AssinaturaInvalida extends Error {}

// Confere a assinatura do aviso (cabeçalho stripe-signature) com STRIPE_WEBHOOK_SECRET e traduz o
// evento. Sem assinatura válida, lança AssinaturaInvalida (a rota responde 401). O corpo precisa ser
// o texto cru, do jeito que chegou.
export function lerAvisoDaStripe(
  corpo: string,
  assinatura: string | null,
): { idExterno: string; situacao: SituacaoNoGateway } | null {
  const segredo = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!segredo) throw new PagamentoIndisponivelError("O webhook de pagamento não está configurado neste ambiente.");
  if (!assinatura) throw new AssinaturaInvalida("Aviso sem assinatura.");
  let evento: Stripe.Event;
  try {
    // estático: conferir a assinatura só precisa do STRIPE_WEBHOOK_SECRET, não da chave secreta
    evento = Stripe.webhooks.constructEvent(corpo, assinatura, segredo);
  } catch {
    throw new AssinaturaInvalida("Assinatura do aviso inválida.");
  }
  const situacaoDoEvento = EVENTOS[evento.type];
  if (!situacaoDoEvento) return null;
  const pi = evento.data.object as Stripe.PaymentIntent;
  if (!pi?.id?.startsWith("pi_")) return null;
  // payment_failed de um Pix vencido conta como expirado
  const situacao =
    situacaoDoEvento === "recusado" && pi.last_payment_error?.code === "payment_intent_payment_attempt_expired"
      ? "expirado"
      : situacaoDoEvento;
  return { idExterno: pi.id, situacao };
}
