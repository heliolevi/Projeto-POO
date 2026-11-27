import assert from "node:assert/strict";
import { describe, test } from "node:test";
import Stripe from "stripe";
import { PagamentoIndisponivelError } from "../../../shared/http/errors.ts";
import {
  AssinaturaInvalida,
  exigirCodigoDeVerdadeEmProducao,
  lerAvisoDaStripe,
  situacaoDoPaymentIntent,
} from "./gateway-stripe.ts";

// Nenhum teste aqui fala com a Stripe: a chave é de mentira e a assinatura é gerada localmente com
// o mesmo algoritmo da Stripe (HMAC-SHA256), pela própria biblioteca.
const SEGREDO = "whsec_teste_local_nao_e_segredo";
process.env.STRIPE_SECRET_KEY = "sk_test_chave_de_mentira";
process.env.STRIPE_WEBHOOK_SECRET = SEGREDO;

const stripe = new Stripe("sk_test_chave_de_mentira");
const evento = (type: string, pi: Record<string, unknown>) =>
  JSON.stringify({ id: "evt_1", object: "event", type, data: { object: { object: "payment_intent", ...pi } } });
const assinar = (corpo: string, segredo = SEGREDO) =>
  stripe.webhooks.generateTestHeaderString({ payload: corpo, secret: segredo });

describe("situacaoDoPaymentIntent", () => {
  test("traduz o status do PaymentIntent para o vocabulário do sistema", () => {
    assert.equal(situacaoDoPaymentIntent({ status: "succeeded", last_payment_error: null }), "aprovado");
    assert.equal(situacaoDoPaymentIntent({ status: "requires_action", last_payment_error: null }), "pendente");
    assert.equal(situacaoDoPaymentIntent({ status: "processing", last_payment_error: null }), "pendente");
    assert.equal(situacaoDoPaymentIntent({ status: "canceled", last_payment_error: null }), "expirado");
    assert.equal(
      situacaoDoPaymentIntent({
        status: "requires_payment_method",
        last_payment_error: { code: "payment_intent_payment_attempt_expired" } as Stripe.PaymentIntent.LastPaymentError,
      }),
      "expirado",
    );
    assert.equal(
      situacaoDoPaymentIntent({
        status: "requires_payment_method",
        last_payment_error: { code: "payment_method_provider_decline" } as Stripe.PaymentIntent.LastPaymentError,
      }),
      "recusado",
    );
  });
});

describe("lerAvisoDaStripe (assinatura do webhook)", () => {
  test("aviso assinado de pagamento aprovado vira { idExterno, aprovado }", () => {
    const corpo = evento("payment_intent.succeeded", { id: "pi_123", status: "succeeded" });
    assert.deepEqual(lerAvisoDaStripe(corpo, assinar(corpo)), { idExterno: "pi_123", situacao: "aprovado" });
  });

  test("Pix vencido (payment_failed com tentativa expirada) vira expirado", () => {
    const corpo = evento("payment_intent.payment_failed", {
      id: "pi_9",
      last_payment_error: { code: "payment_intent_payment_attempt_expired" },
    });
    assert.deepEqual(lerAvisoDaStripe(corpo, assinar(corpo)), { idExterno: "pi_9", situacao: "expirado" });
  });

  test("evento que não interessa é ignorado (null)", () => {
    const corpo = evento("payment_intent.created", { id: "pi_1" });
    assert.equal(lerAvisoDaStripe(corpo, assinar(corpo)), null);
  });

  test("sem assinatura, com assinatura de outro segredo ou corpo alterado: AssinaturaInvalida", () => {
    const corpo = evento("payment_intent.succeeded", { id: "pi_123" });
    assert.throws(() => lerAvisoDaStripe(corpo, null), AssinaturaInvalida);
    assert.throws(() => lerAvisoDaStripe(corpo, assinar(corpo, "whsec_outro")), AssinaturaInvalida);
    assert.throws(() => lerAvisoDaStripe(corpo.replace("pi_123", "pi_999"), assinar(corpo)), AssinaturaInvalida);
  });

  test("sem STRIPE_WEBHOOK_SECRET o webhook fica indisponível (502), nunca aberto", () => {
    const antes = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    try {
      const corpo = evento("payment_intent.succeeded", { id: "pi_1" });
      assert.throws(() => lerAvisoDaStripe(corpo, "t=1,v1=x"), PagamentoIndisponivelError);
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = antes;
    }
  });
});

describe("exigirCodigoDeVerdadeEmProducao", () => {
  const BR_CODE =
    "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000" +
    "5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D";
  const DE_TESTE = "123456789br.gov.bcb.pixapi.developer.stripe.com/v1/p/v2/1234567890abcdef/789";

  test("em produção, um BR Code de verdade passa", () => {
    assert.doesNotThrow(() => exigirCodigoDeVerdadeEmProducao({ id: "pi_1", livemode: true }, BR_CODE));
  });

  test("em produção, um código fora do padrão é barrado (não vai para o cliente)", () => {
    assert.throws(() => exigirCodigoDeVerdadeEmProducao({ id: "pi_1", livemode: true }, DE_TESTE), /BR Code/);
  });

  test("no modo de teste, o código fictício da Stripe passa (é o único que existe ali)", () => {
    assert.doesNotThrow(() => exigirCodigoDeVerdadeEmProducao({ id: "pi_1", livemode: false }, DE_TESTE));
  });
});
