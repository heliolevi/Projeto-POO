import assert from "node:assert/strict";
import { describe, test } from "node:test";
import Stripe from "stripe";
import { PagamentoIndisponivelError } from "../../../shared/http/errors.ts";
import { AssinaturaInvalida } from "../application/portas.ts";
import { LeitorDeAvisoDaStripe } from "./aviso-da-stripe.ts";

// Nenhum teste aqui fala com a Stripe: a assinatura é gerada localmente com o mesmo algoritmo da
// Stripe (HMAC-SHA256), pela própria biblioteca.
const SEGREDO = "whsec_teste_local_nao_e_segredo";
const stripe = new Stripe("sk_test_chave_de_mentira");
const leitor = (...segredo: [] | [string | undefined]) =>
  new LeitorDeAvisoDaStripe(() => (segredo.length === 0 ? SEGREDO : segredo[0]));

const evento = (type: string, pi: Record<string, unknown>) =>
  JSON.stringify({ id: "evt_1", object: "event", type, data: { object: { object: "payment_intent", ...pi } } });
const assinar = (corpo: string, segredo = SEGREDO) => stripe.webhooks.generateTestHeaderString({ payload: corpo, secret: segredo });

describe("LeitorDeAvisoDaStripe (assinatura do webhook)", () => {
  test("aviso assinado de pagamento aprovado vira { idExterno, aprovado }", () => {
    const corpo = evento("payment_intent.succeeded", { id: "pi_123", status: "succeeded" });
    assert.deepEqual(leitor().ler(corpo, assinar(corpo)), { idExterno: "pi_123", situacao: "aprovado" });
  });

  test("pagamento recusado e cancelado viram recusado e expirado", () => {
    const falhou = evento("payment_intent.payment_failed", { id: "pi_5", last_payment_error: { code: "card_declined" } });
    assert.deepEqual(leitor().ler(falhou, assinar(falhou)), { idExterno: "pi_5", situacao: "recusado" });
    const falhouSemErro = evento("payment_intent.payment_failed", { id: "pi_6" });
    assert.deepEqual(leitor().ler(falhouSemErro, assinar(falhouSemErro)), { idExterno: "pi_6", situacao: "recusado" });
    const cancelado = evento("payment_intent.canceled", { id: "pi_7" });
    assert.deepEqual(leitor().ler(cancelado, assinar(cancelado)), { idExterno: "pi_7", situacao: "expirado" });
  });

  test("Pix vencido (payment_failed com tentativa expirada) vira expirado", () => {
    const corpo = evento("payment_intent.payment_failed", {
      id: "pi_9",
      last_payment_error: { code: "payment_intent_payment_attempt_expired" },
    });
    assert.deepEqual(leitor().ler(corpo, assinar(corpo)), { idExterno: "pi_9", situacao: "expirado" });
  });

  test("evento que não interessa é ignorado (null)", () => {
    for (const tipo of ["payment_intent.created", "charge.succeeded", "customer.created"]) {
      const corpo = evento(tipo, { id: "pi_1" });
      assert.equal(leitor().ler(corpo, assinar(corpo)), null, tipo);
    }
  });

  test("evento cujo objeto não é um PaymentIntent (id sem pi_) é ignorado", () => {
    const corpo = evento("payment_intent.succeeded", { id: "ch_1" });
    assert.equal(leitor().ler(corpo, assinar(corpo)), null);
  });

  test("sem assinatura, com assinatura de outro segredo ou corpo alterado: AssinaturaInvalida", () => {
    const corpo = evento("payment_intent.succeeded", { id: "pi_123" });
    assert.throws(() => leitor().ler(corpo, null), AssinaturaInvalida);
    assert.throws(() => leitor().ler(corpo, ""), AssinaturaInvalida);
    assert.throws(() => leitor().ler(corpo, assinar(corpo, "whsec_outro")), AssinaturaInvalida);
    assert.throws(() => leitor().ler(corpo.replace("pi_123", "pi_999"), assinar(corpo)), AssinaturaInvalida);
    assert.throws(() => leitor().ler(corpo, "t=1,v1=falsa"), AssinaturaInvalida);
  });

  test("a assinatura é conferida ANTES de olhar o conteúdo: corpo que não é JSON com assinatura falsa é 401, não erro de leitura", () => {
    assert.throws(() => leitor().ler("isto não é json", "t=1,v1=falsa"), AssinaturaInvalida);
  });

  test("sem segredo (ausente, vazio ou só espaços) o webhook fica indisponível (502), nunca aberto", () => {
    const corpo = evento("payment_intent.succeeded", { id: "pi_1" });
    for (const segredo of [undefined, "", "   "]) {
      assert.throws(() => leitor(segredo).ler(corpo, assinar(corpo)), PagamentoIndisponivelError);
    }
  });

  test("o segredo é lido a cada aviso (configurar depois passa a valer)", () => {
    let segredo = undefined as string | undefined;
    const l = new LeitorDeAvisoDaStripe(() => segredo);
    const corpo = evento("payment_intent.succeeded", { id: "pi_1" });
    assert.throws(() => l.ler(corpo, assinar(corpo)), PagamentoIndisponivelError);
    segredo = SEGREDO;
    assert.deepEqual(l.ler(corpo, assinar(corpo)), { idExterno: "pi_1", situacao: "aprovado" });
  });

  test("AssinaturaInvalida é um Error com a mensagem do motivo", () => {
    const corpo = evento("payment_intent.succeeded", { id: "pi_1" });
    assert.throws(() => leitor().ler(corpo, null), { message: "Aviso sem assinatura." });
    assert.throws(() => leitor().ler(corpo, "t=1,v1=x"), { message: "Assinatura do aviso inválida." });
  });

  test("nenhum campo é visível e o do app existe", () => {
    assert.deepEqual(Object.keys(leitor()), []);
    assert.ok(LeitorDeAvisoDaStripe.padrao instanceof LeitorDeAvisoDaStripe);
  });

  test("o do app lê STRIPE_WEBHOOK_SECRET", () => {
    const antes = process.env.STRIPE_WEBHOOK_SECRET;
    const corpo = evento("payment_intent.succeeded", { id: "pi_3" });
    try {
      process.env.STRIPE_WEBHOOK_SECRET = SEGREDO;
      assert.deepEqual(LeitorDeAvisoDaStripe.padrao.ler(corpo, assinar(corpo)), { idExterno: "pi_3", situacao: "aprovado" });
      delete process.env.STRIPE_WEBHOOK_SECRET;
      assert.throws(() => LeitorDeAvisoDaStripe.padrao.ler(corpo, assinar(corpo)), PagamentoIndisponivelError);
    } finally {
      if (antes === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
      else process.env.STRIPE_WEBHOOK_SECRET = antes;
    }
  });
});
