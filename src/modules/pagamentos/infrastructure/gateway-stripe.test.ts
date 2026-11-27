import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PagamentoIndisponivelError } from "../../../shared/http/errors.ts";
import { GatewayStripe } from "./gateway-stripe.ts";

// Nenhum teste aqui fala com a Stripe: o fetch é de mentira e a chave é fictícia. A biblioteca da
// Stripe roda de verdade por cima desse fetch, então o que se confere é o pedido que ela montaria na
// rede (rota, corpo, cabeçalhos) e a tradução da resposta.
const BR_CODE =
  "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000" +
  "5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D";
const DE_TESTE = "123456789br.gov.bcb.pixapi.developer.stripe.com/v1/p/v2/1234567890abcdef/789";

type Chamada = { metodo: string; url: URL; cabecalhos: Headers; corpo: URLSearchParams };
type Resposta = { status?: number; corpo: unknown };

function montar(
  responder: (chamada: Chamada, n: number) => Resposta,
  opcoes: { chave?: () => string | undefined } = {},
) {
  const chamadas: Chamada[] = [];
  const logs: unknown[][] = [];
  const fetchDeMentira = (async (entrada: URL | string | Request, init?: RequestInit) => {
    const chamada: Chamada = {
      metodo: String(init?.method),
      url: new URL(String(entrada)),
      cabecalhos: new Headers(init?.headers),
      corpo: new URLSearchParams(String(init?.body ?? "")),
    };
    chamadas.push(chamada);
    const r = responder(chamada, chamadas.length);
    return new Response(JSON.stringify(r.corpo), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const gateway = new GatewayStripe({
    chave: opcoes.chave ?? (() => "sk_test_chave_de_mentira"),
    fetch: fetchDeMentira,
    tentativasDeRede: 0,
    registrarErro: (...partes) => logs.push(partes),
  });
  return { gateway, chamadas, logs };
}

const intent = (extra: Record<string, unknown> = {}) => ({
  id: "pi_123",
  object: "payment_intent",
  status: "requires_action",
  livemode: false,
  next_action: { type: "pix_display_qr_code", pix_display_qr_code: { data: DE_TESTE } },
  ...extra,
});

const COBRANCA = {
  pagamentoId: "pg-1",
  reservaId: "r-1",
  valorCentavos: 4800,
  expiraEm: new Date("2026-11-14T12:15:00.000Z"),
  pagador: { nome: "Cliente Teste", email: "cliente@example.com" },
};

describe("GatewayStripe.criarCobrancaPix", () => {
  test("pede à Stripe um PaymentIntent Pix confirmado, com valor, prazo, pagador e chave de idempotência", async () => {
    const { gateway, chamadas } = montar(() => ({ corpo: intent() }));
    const r = await gateway.criarCobrancaPix(COBRANCA);
    assert.deepEqual(r, { idExterno: "pi_123", copiaECola: DE_TESTE });

    assert.equal(chamadas.length, 1);
    const c = chamadas[0];
    assert.equal(c.metodo, "POST");
    assert.equal(c.url.pathname, "/v1/payment_intents");
    assert.equal(c.cabecalhos.get("authorization"), "Bearer sk_test_chave_de_mentira");
    assert.equal(c.cabecalhos.get("idempotency-key"), "pagamento-pg-1");
    assert.equal(c.corpo.get("amount"), "4800");
    assert.equal(c.corpo.get("currency"), "brl");
    assert.equal(c.corpo.get("confirm"), "true");
    assert.equal(c.corpo.get("allowed_payment_method_types[0]"), "pix");
    assert.equal(c.corpo.get("payment_method_data[type]"), "pix");
    assert.equal(c.corpo.get("payment_method_data[billing_details][name]"), "Cliente Teste");
    assert.equal(c.corpo.get("payment_method_data[billing_details][email]"), "cliente@example.com");
    assert.equal(c.corpo.get("payment_method_options[pix][expires_at]"), String(Date.parse("2026-11-14T12:15:00.000Z") / 1000));
    assert.equal(c.corpo.get("metadata[pagamento_id]"), "pg-1");
    assert.equal(c.corpo.get("metadata[reserva_id]"), "r-1");
  });

  test("em produção, um BR Code de verdade passa", async () => {
    const { gateway } = montar(() =>
      ({ corpo: intent({ livemode: true, next_action: { type: "pix_display_qr_code", pix_display_qr_code: { data: BR_CODE } } }) }),
    );
    assert.equal((await gateway.criarCobrancaPix(COBRANCA)).copiaECola, BR_CODE);
  });

  test("em produção, um código fora do padrão cancela o PaymentIntent na Stripe e vira 502 sem vazar o motivo", async () => {
    const { gateway, chamadas, logs } = montar((c) =>
      c.url.pathname.endsWith("/cancel") ? { corpo: intent({ status: "canceled" }) } : { corpo: intent({ livemode: true }) },
    );
    await assert.rejects(gateway.criarCobrancaPix(COBRANCA), (e: Error) => {
      assert.ok(e instanceof PagamentoIndisponivelError);
      assert.ok(!/BR Code|pi_123/.test(e.message), "a mensagem ao cliente é genérica");
      return true;
    });
    assert.equal(chamadas.length, 2);
    assert.equal(chamadas[1].url.pathname, "/v1/payment_intents/pi_123/cancel");
    assert.equal(chamadas[1].cabecalhos.get("idempotency-key"), "cancelamento-pi_123");
    assert.match(String(logs[0].join(" ")), /BR Code/, "o detalhe vai para o log");
  });

  test("PaymentIntent sem copia e cola também é cancelado e vira 502", async () => {
    const { gateway, chamadas } = montar((c) =>
      c.url.pathname.endsWith("/cancel") ? { corpo: intent({ status: "canceled" }) } : { corpo: intent({ next_action: null }) },
    );
    await assert.rejects(gateway.criarCobrancaPix(COBRANCA), PagamentoIndisponivelError);
    assert.equal(chamadas[1].url.pathname, "/v1/payment_intents/pi_123/cancel");
  });

  test("se o cancelamento também falhar, o erro vai para o log e o cliente continua recebendo só o 502", async () => {
    const { gateway, logs } = montar((c) =>
      c.url.pathname.endsWith("/cancel")
        ? { status: 400, corpo: { error: { type: "invalid_request_error", message: "já cancelado" } } }
        : { corpo: intent({ next_action: null }) },
    );
    await assert.rejects(gateway.criarCobrancaPix(COBRANCA), PagamentoIndisponivelError);
    assert.ok(logs.some((l) => String(l[0]).includes("cancelar pi_123")));
  });

  test("erro da Stripe (chave recusada) vira 502 genérico e o detalhe só vai para o log", async () => {
    const { gateway, logs } = montar(() => ({
      status: 401,
      corpo: { error: { type: "authentication_error", message: "Invalid API Key provided: sk_test_***" } },
    }));
    await assert.rejects(gateway.criarCobrancaPix(COBRANCA), (e: Error) => {
      assert.ok(e instanceof PagamentoIndisponivelError);
      assert.ok(!/Invalid API Key/.test(e.message));
      return true;
    });
    assert.match(String(logs[0].join(" ")), /Invalid API Key/);
  });
});

describe("GatewayStripe sem chave configurada", () => {
  test("toda operação responde PagamentoIndisponivelError e nada sai pela rede", async () => {
    for (const chave of [undefined, "", "   "]) {
      const { gateway, chamadas } = montar(() => ({ corpo: intent() }), { chave: () => chave });
      await assert.rejects(gateway.criarCobrancaPix(COBRANCA), PagamentoIndisponivelError);
      await assert.rejects(gateway.consultar("pi_1"), PagamentoIndisponivelError);
      await assert.rejects(gateway.estornar("pi_1"), PagamentoIndisponivelError);
      await assert.rejects(gateway.cancelar("pi_1"), PagamentoIndisponivelError);
      assert.equal(chamadas.length, 0);
    }
  });

  test("a mensagem não revela nada além de que o pagamento não está configurado", async () => {
    const { gateway } = montar(() => ({ corpo: intent() }), { chave: () => undefined });
    await assert.rejects(gateway.consultar("pi_1"), { message: "O pagamento ainda não está configurado neste ambiente." });
  });

  test("a chave é lida a cada uso: configurar depois passa a valer, e trocar a chave refaz o cliente", async () => {
    let chave: string | undefined;
    const { gateway, chamadas } = montar(() => ({ corpo: intent({ status: "succeeded" }) }), { chave: () => chave });
    await assert.rejects(gateway.consultar("pi_1"), PagamentoIndisponivelError);
    chave = "sk_test_primeira";
    await gateway.consultar("pi_1");
    chave = "sk_test_segunda";
    await gateway.consultar("pi_1");
    assert.deepEqual(
      chamadas.map((c) => c.cabecalhos.get("authorization")),
      ["Bearer sk_test_primeira", "Bearer sk_test_segunda"],
    );
  });
});

describe("GatewayStripe.consultar, estornar e cancelar", () => {
  test("consultar traduz o status do PaymentIntent para o vocabulário do sistema", async () => {
    const casos: [Record<string, unknown>, string][] = [
      [{ status: "succeeded" }, "aprovado"],
      [{ status: "requires_action" }, "pendente"],
      [{ status: "canceled" }, "expirado"],
      [{ status: "requires_payment_method", last_payment_error: { code: "payment_intent_payment_attempt_expired" } }, "expirado"],
      [{ status: "requires_payment_method", last_payment_error: { code: "card_declined" } }, "recusado"],
    ];
    for (const [extra, esperado] of casos) {
      const { gateway, chamadas } = montar(() => ({ corpo: intent(extra) }));
      assert.equal(await gateway.consultar("pi_123"), esperado, JSON.stringify(extra));
      assert.equal(chamadas[0].metodo, "GET");
      assert.equal(chamadas[0].url.pathname, "/v1/payment_intents/pi_123");
    }
  });

  test("estornar devolve o valor inteiro, com chave de idempotência: pedir duas vezes não devolve duas", async () => {
    const { gateway, chamadas } = montar(() => ({ corpo: { id: "re_1", object: "refund" } }));
    await gateway.estornar("pi_123");
    await gateway.estornar("pi_123");
    for (const c of chamadas) {
      assert.equal(c.url.pathname, "/v1/refunds");
      assert.equal(c.corpo.get("payment_intent"), "pi_123");
      assert.equal(c.corpo.get("amount"), null, "sem amount: devolve o valor inteiro");
      assert.equal(c.cabecalhos.get("idempotency-key"), "estorno-pi_123");
    }
  });

  test("cancelar chama o cancelamento com idempotência; se a Stripe recusa, vira 502", async () => {
    const ok = montar(() => ({ corpo: intent({ status: "canceled" }) }));
    await ok.gateway.cancelar("pi_9");
    assert.equal(ok.chamadas[0].url.pathname, "/v1/payment_intents/pi_9/cancel");
    assert.equal(ok.chamadas[0].cabecalhos.get("idempotency-key"), "cancelamento-pi_9");

    const recusa = montar(() => ({ status: 400, corpo: { error: { type: "invalid_request_error", message: "já pago" } } }));
    await assert.rejects(recusa.gateway.cancelar("pi_9"), PagamentoIndisponivelError);
  });

  test("falha de rede vira 502 (nunca o erro cru) em todas as operações", async () => {
    const gateway = new GatewayStripe({
      chave: () => "sk_test_x",
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
      tentativasDeRede: 0,
      registrarErro: () => {},
    });
    await assert.rejects(gateway.criarCobrancaPix(COBRANCA), PagamentoIndisponivelError);
    await assert.rejects(gateway.consultar("pi_1"), PagamentoIndisponivelError);
    await assert.rejects(gateway.estornar("pi_1"), PagamentoIndisponivelError);
    await assert.rejects(gateway.cancelar("pi_1"), PagamentoIndisponivelError);
  });
});

describe("GatewayStripe: encapsulamento e instância do app", () => {
  test("nenhum campo é visível e o do app existe", () => {
    assert.deepEqual(Object.keys(montar(() => ({ corpo: {} })).gateway), []);
    assert.ok(GatewayStripe.padrao instanceof GatewayStripe);
  });

  test("o do app sem STRIPE_SECRET_KEY responde 502 sem tocar na rede", async () => {
    const antes = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      await assert.rejects(GatewayStripe.padrao.consultar("pi_1"), PagamentoIndisponivelError);
    } finally {
      if (antes !== undefined) process.env.STRIPE_SECRET_KEY = antes;
    }
  });

  test("estresse: 50 consultas ao mesmo tempo respondem todas, cada uma com a sua chamada", async () => {
    const { gateway, chamadas } = montar(() => ({ corpo: intent({ status: "succeeded" }) }));
    const respostas = await Promise.all(Array.from({ length: 50 }, () => gateway.consultar("pi_1")));
    assert.ok(respostas.every((r) => r === "aprovado"));
    assert.equal(chamadas.length, 50);
  });
});
