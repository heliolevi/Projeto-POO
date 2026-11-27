import assert from "node:assert/strict";
import { test } from "node:test";
import Stripe from "stripe";
import { ConflictError, NotFoundError, PagamentoIndisponivelError, UnauthorizedError } from "../../../shared/http/errors.ts";
import { AssinaturaInvalida, type AvisoDoGateway, type SessaoCliente } from "../application/portas.ts";
import { LeitorDeAvisoDaStripe } from "../infrastructure/aviso-da-stripe.ts";
import { ControladorDePagamentos, LIMITE_CORPO_WEBHOOK_BYTES, LIMITE_PAGAMENTOS_POR_USUARIO } from "./controlador-de-pagamentos.ts";

// Provam a ORDEM das rotas 16 a 18: sessão (401), perfil (403), corpo (413/400) e só então o caso de uso
// (e o banco). Os casos de uso e a Stripe são de mentira; o banco real está em db/tests.
const CONTAS = {
  "token-cliente": { usuarioId: "bbbbbbbb-0000-4000-8000-000000000002", perfil: "CLIENTE" as const },
  "token-operador": { usuarioId: "cccccccc-0000-4000-8000-000000000003", perfil: "OPERADOR" as const },
  "token-admin": { usuarioId: "aaaaaaaa-0000-4000-8000-000000000001", perfil: "ADMIN" as const },
};
const RESERVA = "11111111-1111-4111-8111-111111111111";
const COBRANCA = { pagamentoId: "pg-1", reservaId: RESERVA, metodo: "PIX", status: "PENDENTE", valorCentavos: 4800 };

type Opcoes = {
  criada?: boolean;
  falhaNoCaso?: Error;
  aviso?: AvisoDoGateway | null;
  falhaNaLeitura?: Error;
};

function montar(opcoes: Opcoes = {}) {
  const eventos: string[] = [];
  const iniciar: { sessao: SessaoCliente; corpo: unknown }[] = [];
  const status: { sessao: SessaoCliente; reservaId: unknown }[] = [];
  const avisosProcessados: [string, string][] = [];
  const lidos: { corpo: string; assinatura: string | null }[] = [];
  const controlador = new ControladorDePagamentos({
    exigirSessao: async (request) => {
      eventos.push("sessao");
      const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1] as keyof typeof CONTAS | undefined;
      const conta = token ? CONTAS[token] : undefined;
      if (!conta) throw new UnauthorizedError("Sessão inválida ou expirada.");
      return conta;
    },
    pagamentos: {
      async iniciar(sessao, corpo) {
        eventos.push("iniciar");
        iniciar.push({ sessao, corpo });
        if (opcoes.falhaNoCaso) throw opcoes.falhaNoCaso;
        return { cobranca: COBRANCA as never, criada: opcoes.criada ?? true };
      },
      async consultarStatus(sessao, reservaId) {
        eventos.push("status");
        status.push({ sessao, reservaId });
        if (opcoes.falhaNoCaso) throw opcoes.falhaNoCaso;
        return { reservaId: String(reservaId), statusPagamento: "PENDENTE", statusReserva: "PENDENTE_PAGAMENTO" };
      },
      async processarAviso(idExterno, situacao) {
        eventos.push("aviso");
        avisosProcessados.push([idExterno, situacao]);
        if (opcoes.falhaNoCaso) throw opcoes.falhaNoCaso;
        return "confirmado";
      },
    },
    avisos: {
      ler(corpo, assinatura) {
        eventos.push("assinatura");
        lidos.push({ corpo, assinatura });
        if (opcoes.falhaNaLeitura) throw opcoes.falhaNaLeitura;
        return opcoes.aviso === undefined ? { idExterno: "pi_1", situacao: "aprovado" } : opcoes.aviso;
      },
    },
  });
  return { controlador, eventos, iniciar, status, avisosProcessados, lidos };
}

const post = (corpo: unknown, token?: string) =>
  new Request("http://localhost/api/pagamentos", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
const get = (token?: string) =>
  new Request(`http://localhost/api/pagamentos/${RESERVA}/status`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
const webhook = (corpo: string, assinatura: string | null = "t=1,v1=x") =>
  new Request("http://localhost/api/pagamentos/webhook", {
    method: "POST",
    headers: assinatura ? { "stripe-signature": assinatura } : {},
    body: corpo,
  });

test("rota 16: sem token ou com token inválido é 401, sem ler o corpo nem chamar o caso de uso", async () => {
  const m = montar();
  assert.equal((await m.controlador.criar(post({ reservaId: RESERVA, metodo: "PIX" }))).status, 401);
  assert.equal((await m.controlador.criar(post({}, "lixo"))).status, 401);
  assert.deepEqual(m.eventos, ["sessao", "sessao"]);
});

test("rotas 16 e 17: operador e administrador são 403 antes de qualquer caso de uso", async () => {
  for (const token of ["token-operador", "token-admin"]) {
    const m = montar();
    assert.equal((await m.controlador.criar(post({ reservaId: RESERVA, metodo: "PIX" }, token))).status, 403, token);
    assert.equal((await m.controlador.consultarStatus(get(token), RESERVA)).status, 403, token);
    assert.deepEqual(m.eventos, ["sessao", "sessao"]);
  }
});

test("rota 16: cobrança nova é 201 e Pix reaproveitado é 200, sempre sem cache, no formato { data }", async () => {
  for (const [criada, esperado] of [[true, 201], [false, 200]] as const) {
    const m = montar({ criada });
    const r = await m.controlador.criar(post({ reservaId: RESERVA, metodo: "PIX" }, "token-cliente"));
    assert.equal(r.status, esperado);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.deepEqual(await r.json(), { data: COBRANCA });
    assert.deepEqual(m.eventos, ["sessao", "iniciar"]);
  }
});

test("rota 16: o caso de uso recebe a sessão do cliente e o corpo lido (JSON)", async () => {
  const m = montar();
  await m.controlador.criar(post({ reservaId: RESERVA, metodo: "PIX" }, "token-cliente"));
  assert.deepEqual(m.iniciar[0].sessao, { usuarioId: CONTAS["token-cliente"].usuarioId, perfil: "CLIENTE" });
  assert.deepEqual(m.iniciar[0].corpo, { reservaId: RESERVA, metodo: "PIX" });
});

test("rota 16: JSON quebrado é 400 e corpo acima de 16 KiB é 413, sem chegar ao caso de uso", async () => {
  const m = montar();
  assert.equal((await m.controlador.criar(post("{quebrado", "token-cliente"))).status, 400);
  assert.equal((await m.controlador.criar(post("x".repeat(17 * 1024), "token-cliente"))).status, 413);
  assert.deepEqual(m.eventos, ["sessao", "sessao"]);
});

test("rotas 16, 17 e 18: erro do caso de uso vira o status do erro; erro inesperado vira 500 sem detalhe", async () => {
  const casos: [Error, number, string][] = [
    [new NotFoundError("Reserva não encontrada."), 404, "NOT_FOUND"],
    [new ConflictError("Reserva já paga."), 409, "CONFLICT"],
    [new PagamentoIndisponivelError(), 502, "PAGAMENTO_INDISPONIVEL"],
  ];
  const silenciar = console.error;
  console.error = () => {};
  try {
    for (const [falha, status] of casos) {
      const m = montar({ falhaNoCaso: falha });
      assert.equal((await m.controlador.criar(post({}, "token-cliente"))).status, status);
      assert.equal((await m.controlador.consultarStatus(get("token-cliente"), RESERVA)).status, status);
      assert.equal((await m.controlador.receberAviso(webhook("{}"))).status, status);
    }
    const m = montar({ falhaNoCaso: new Error("senha do banco: segredo") });
    const r = await m.controlador.criar(post({}, "token-cliente"));
    assert.equal(r.status, 500);
    assert.ok(!JSON.stringify(await r.json()).includes("segredo"));
  } finally {
    console.error = silenciar;
  }
});

test("rota 17: devolve o status da reserva informada, sem cache, com a sessão do cliente", async () => {
  const m = montar();
  const r = await m.controlador.consultarStatus(get("token-cliente"), RESERVA);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(await r.json(), { data: { reservaId: RESERVA, statusPagamento: "PENDENTE", statusReserva: "PENDENTE_PAGAMENTO" } });
  assert.equal(m.status[0].reservaId, RESERVA);
  assert.equal(m.status[0].sessao.usuarioId, CONTAS["token-cliente"].usuarioId);
});

test("rota 17: sem sessão é 401 e não há limite de tentativas (a tela consulta a cada 3 s)", async () => {
  const m = montar();
  assert.equal((await m.controlador.consultarStatus(get(), RESERVA)).status, 401);
  for (let i = 0; i < 100; i++) assert.equal((await m.controlador.consultarStatus(get("token-cliente"), RESERVA)).status, 200);
});

test("rota 18: aviso com assinatura válida é processado e responde { recebido, resultado }", async () => {
  const m = montar();
  const r = await m.controlador.receberAviso(webhook('{"id":"evt"}', "t=1,v1=ok"));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(await r.json(), { data: { recebido: true, resultado: "confirmado" } });
  assert.deepEqual(m.lidos, [{ corpo: '{"id":"evt"}', assinatura: "t=1,v1=ok" }]);
  assert.deepEqual(m.avisosProcessados, [["pi_1", "aprovado"]]);
  assert.deepEqual(m.eventos, ["assinatura", "aviso"]);
});

test("rota 18: o webhook não pede sessão de usuário", async () => {
  const m = montar();
  await m.controlador.receberAviso(webhook("{}"));
  assert.ok(!m.eventos.includes("sessao"));
});

test("rota 18: evento que não interessa responde 200 ignorado, sem chamar o caso de uso", async () => {
  const m = montar({ aviso: null });
  const r = await m.controlador.receberAviso(webhook("{}"));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { data: { recebido: true, resultado: "ignorado" } });
  assert.deepEqual(m.eventos, ["assinatura"]);
});

test("rota 18: assinatura inválida ou ausente é 401 e nada é processado", async () => {
  const m = montar({ falhaNaLeitura: new AssinaturaInvalida("Assinatura do aviso inválida.") });
  const r = await m.controlador.receberAviso(webhook("{}", null));
  assert.equal(r.status, 401);
  assert.equal((await r.json()).error.message, "Assinatura do aviso inválida.");
  assert.deepEqual(m.eventos, ["assinatura"]);
});

test("rota 18: sem STRIPE_WEBHOOK_SECRET é 502 (nunca aberto) e nada é processado", async () => {
  const m = montar({ falhaNaLeitura: new PagamentoIndisponivelError("O webhook de pagamento não está configurado neste ambiente.") });
  assert.equal((await m.controlador.receberAviso(webhook("{}"))).status, 502);
  assert.deepEqual(m.eventos, ["assinatura"]);
});

test("rota 18: corpo acima de 64 KiB é 413 antes de conferir a assinatura; até 64 KiB passa", async () => {
  const m = montar();
  assert.equal((await m.controlador.receberAviso(webhook("x".repeat(LIMITE_CORPO_WEBHOOK_BYTES + 1)))).status, 413);
  assert.deepEqual(m.eventos, []);
  assert.equal((await m.controlador.receberAviso(webhook("x".repeat(LIMITE_CORPO_WEBHOOK_BYTES)))).status, 200);
});

test("rota 18 com o leitor REAL da Stripe: aviso assinado de verdade passa; forjado é 401; sem segredo é 502", async () => {
  const SEGREDO = "whsec_teste_local_nao_e_segredo";
  const stripe = new Stripe("sk_test_chave_de_mentira");
  const corpo = JSON.stringify({
    id: "evt_1",
    object: "event",
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_42", object: "payment_intent", status: "succeeded" } },
  });
  const processados: [string, string][] = [];
  const montarReal = (segredo: string | undefined) =>
    new ControladorDePagamentos({
      exigirSessao: async () => CONTAS["token-cliente"],
      pagamentos: {
        iniciar: async () => { throw new Error("não devia chamar"); },
        consultarStatus: async () => { throw new Error("não devia chamar"); },
        processarAviso: async (id, situacao) => { processados.push([id, situacao]); return "confirmado"; },
      },
      avisos: new LeitorDeAvisoDaStripe(() => segredo),
    });

  const assinado = stripe.webhooks.generateTestHeaderString({ payload: corpo, secret: SEGREDO });
  assert.equal((await montarReal(SEGREDO).receberAviso(webhook(corpo, assinado))).status, 200);
  assert.deepEqual(processados, [["pi_42", "aprovado"]]);

  const forjado = stripe.webhooks.generateTestHeaderString({ payload: corpo, secret: "whsec_do_atacante" });
  assert.equal((await montarReal(SEGREDO).receberAviso(webhook(corpo, forjado))).status, 401);
  assert.equal((await montarReal(SEGREDO).receberAviso(webhook(corpo, null))).status, 401);
  assert.equal((await montarReal(undefined).receberAviso(webhook(corpo, assinado))).status, 502);
  assert.equal(processados.length, 1, "só o aviso legítimo foi processado");
});

test("estresse: 200 webhooks e 200 consultas ao mesmo tempo respondem todos, cada um com o seu resultado", async () => {
  const m = montar();
  const respostas = await Promise.all([
    ...Array.from({ length: 200 }, () => m.controlador.receberAviso(webhook("{}"))),
    ...Array.from({ length: 200 }, () => m.controlador.consultarStatus(get("token-cliente"), RESERVA)),
  ]);
  assert.ok(respostas.every((r) => r.status === 200));
  assert.equal(m.avisosProcessados.length, 200);
  assert.equal(m.status.length, 200);
});

test("o limite de cobranças é de 10 por hora por usuário (contrato, rota 16)", () => {
  assert.deepEqual(LIMITE_PAGAMENTOS_POR_USUARIO, { max: 10, janelaSegundos: 3600 });
  assert.equal(LIMITE_CORPO_WEBHOOK_BYTES, 64 * 1024);
});

test("nenhum campo do controlador é visível", () => {
  assert.deepEqual(Object.keys(montar().controlador), []);
});
