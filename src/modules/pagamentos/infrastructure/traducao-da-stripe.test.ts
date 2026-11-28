import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type Stripe from "stripe";
import { TraducaoDaStripe } from "./traducao-da-stripe.ts";

const erro = (code: string) => ({ code }) as Stripe.PaymentIntent.LastPaymentError;

describe("TraducaoDaStripe.situacaoDoPaymentIntent", () => {
  test("traduz o status do PaymentIntent para o vocabulário do sistema", () => {
    const s = TraducaoDaStripe.situacaoDoPaymentIntent;
    assert.equal(s({ status: "succeeded", last_payment_error: null }), "aprovado");
    assert.equal(s({ status: "requires_action", last_payment_error: null }), "pendente");
    assert.equal(s({ status: "processing", last_payment_error: null }), "pendente");
    assert.equal(s({ status: "requires_confirmation", last_payment_error: null }), "pendente");
    assert.equal(s({ status: "canceled", last_payment_error: null }), "expirado");
    assert.equal(
      s({ status: "requires_payment_method", last_payment_error: erro("payment_intent_payment_attempt_expired") }),
      "expirado",
    );
    assert.equal(s({ status: "requires_payment_method", last_payment_error: erro("payment_method_provider_decline") }), "recusado");
    assert.equal(s({ status: "requires_payment_method", last_payment_error: null }), "recusado");
  });
});

describe("TraducaoDaStripe.exigirCodigoDeVerdadeEmProducao", () => {
  const BR_CODE =
    "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000" +
    "5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D";
  const DE_TESTE = "123456789br.gov.bcb.pixapi.developer.stripe.com/v1/p/v2/1234567890abcdef/789";
  const exigir = TraducaoDaStripe.exigirCodigoDeVerdadeEmProducao;

  test("em produção, um BR Code de verdade passa", () => {
    assert.doesNotThrow(() => exigir({ id: "pi_1", livemode: true }, BR_CODE));
  });

  test("em produção, um código fora do padrão é barrado (não vai para o cliente)", () => {
    assert.throws(() => exigir({ id: "pi_1", livemode: true }, DE_TESTE), /BR Code/);
  });

  test("a mensagem do erro diz de qual PaymentIntent se trata (para o log)", () => {
    assert.throws(() => exigir({ id: "pi_77", livemode: true }, DE_TESTE), /pi_77/);
  });

  test("no modo de teste, o código fictício da Stripe passa (é o único que existe ali)", () => {
    assert.doesNotThrow(() => exigir({ id: "pi_1", livemode: false }, DE_TESTE));
  });
});

test("só tem método estático: não se cria instância", () => {
  assert.throws(() => new (TraducaoDaStripe as unknown as new () => object)(), TypeError);
  assert.equal(TraducaoDaStripe.TENTATIVA_EXPIRADA, "payment_intent_payment_attempt_expired");
});
