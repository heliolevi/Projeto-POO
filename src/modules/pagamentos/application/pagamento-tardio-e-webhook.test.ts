import assert from "node:assert/strict";
import { describe, test } from "node:test";
import Stripe from "stripe";
import { Dinheiro } from "../../../shared/dominio/dinheiro.ts";
import { PagamentoPix } from "../domain/formas-de-pagamento.ts";
import { TransicaoDePagamentoInvalida, type StatusPagamento } from "../domain/pagamento.ts";
import { LeitorDeAvisoDaStripe } from "../infrastructure/aviso-da-stripe.ts";
import { IntervaloDeConsulta } from "./intervalo-de-consulta.ts";

// Ajustes da revisão do #80 que não cabem nos testes dos casos de uso: a regra nova do domínio
// (pagamento tardio), a assinatura do webhook sem a chave secreta e o intervalo de consulta.

const CRIADO = new Date("2026-11-14T11:00:00.000Z");
const PAGO = new Date("2026-11-14T11:05:00.000Z");
const pix = (status?: StatusPagamento) =>
  new PagamentoPix({
    id: "pg-1",
    reservaId: "r-1",
    valor: Dinheiro.deCentavos(4800),
    criadoEm: CRIADO,
    status,
    pagoEm: status === "APROVADO" ? PAGO : undefined,
    mpPaymentId: "pi_1",
    copiaECola: "00020101",
  });

describe("Pagamento.estornarPagamentoTardio (Pix pago depois de vencer aqui)", () => {
  test("EXPIRADO ou RECUSADO pago na Stripe: vira ESTORNADO com o valor inteiro devolvido", () => {
    for (const status of ["EXPIRADO", "RECUSADO"] as const) {
      const p = pix(status);
      assert.equal(p.estornarPagamentoTardio(), true, status);
      assert.equal(p.status, "ESTORNADO", status);
      assert.equal(p.valorEstornado.centavos, 4800, status);
      assert.equal(p.pagoEmParaPersistir(), null, "o banco só aceita pago_em no APROVADO");
    }
  });

  test("é idempotente: já estornado não muda nada", () => {
    const p = pix("EXPIRADO");
    p.estornarPagamentoTardio();
    assert.equal(p.estornarPagamentoTardio(), false);
    assert.equal(p.valorEstornado.centavos, 4800);
  });

  test("só vale para EXPIRADO e RECUSADO: pendente e aprovado seguem o caminho normal", () => {
    for (const status of ["PENDENTE", "APROVADO"] as const) {
      assert.throws(() => pix(status).estornarPagamentoTardio(), TransicaoDePagamentoInvalida, status);
    }
  });

  test("a transição nova não abre outras: expirado não volta a pendente, aprovado nem recusado", () => {
    assert.throws(() => pix("EXPIRADO").confirmar("pi_1", PAGO), TransicaoDePagamentoInvalida);
    assert.throws(() => pix("EXPIRADO").recusar(), TransicaoDePagamentoInvalida);
    assert.throws(() => pix("RECUSADO").expirar(), TransicaoDePagamentoInvalida);
    assert.throws(() => pix("EXPIRADO").estornarTudo(), TransicaoDePagamentoInvalida);
  });
});

describe("LeitorDeAvisoDaStripe sem a chave secreta", () => {
  test("a assinatura do webhook só precisa do STRIPE_WEBHOOK_SECRET", () => {
    const antes = { chave: process.env.STRIPE_SECRET_KEY, segredo: process.env.STRIPE_WEBHOOK_SECRET };
    delete process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_teste_local_nao_e_segredo";
    try {
      const corpo = JSON.stringify({
        id: "evt_1",
        object: "event",
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_7", object: "payment_intent", status: "succeeded" } },
      });
      const assinatura = Stripe.webhooks.generateTestHeaderString({ payload: corpo, secret: "whsec_teste_local_nao_e_segredo" });
      assert.deepEqual(new LeitorDeAvisoDaStripe(() => process.env.STRIPE_WEBHOOK_SECRET).ler(corpo, assinatura), { idExterno: "pi_7", situacao: "aprovado" });
    } finally {
      if (antes.chave === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = antes.chave;
      if (antes.segredo === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
      else process.env.STRIPE_WEBHOOK_SECRET = antes.segredo;
    }
  });
});

describe("IntervaloDeConsulta", () => {
  const t = (ms: number) => new Date(CRIADO.getTime() + ms);

  test("deixa consultar uma vez por intervalo, por chave", () => {
    const i = new IntervaloDeConsulta(6000);
    assert.equal(i.podeConsultar("pi_1", t(0)), true);
    assert.equal(i.podeConsultar("pi_1", t(3000)), false);
    assert.equal(i.podeConsultar("pi_2", t(3000)), true, "outra cobrança tem o seu próprio intervalo");
    assert.equal(i.podeConsultar("pi_1", t(5999)), false);
    assert.equal(i.podeConsultar("pi_1", t(6000)), true);
  });

  test("intervalo zero deixa sempre; valores inválidos não existem", () => {
    const i = new IntervaloDeConsulta(0);
    assert.equal(i.podeConsultar("a", t(0)), true);
    assert.equal(i.podeConsultar("a", t(0)), true);
    assert.throws(() => new IntervaloDeConsulta(-1), RangeError);
    assert.throws(() => new IntervaloDeConsulta(Number.NaN), RangeError);
    assert.throws(() => new IntervaloDeConsulta(1000, 0), RangeError);
  });

  test("estresse: 100 mil cobranças diferentes não fazem a memória passar do máximo", () => {
    const i = new IntervaloDeConsulta(6000, 1000);
    for (let n = 0; n < 100_000; n++) i.podeConsultar(`pi_${n}`, t(n));
    assert.equal(i.tamanho, 1000);
    assert.equal(i.podeConsultar("pi_99999", t(100_000)), false, "a mais recente continua lembrada");
  });
});
