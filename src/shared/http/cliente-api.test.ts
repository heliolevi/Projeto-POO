import assert from "node:assert/strict";
import { test } from "node:test";
import type { JanelaDoNavegador } from "../auth/sessao.ts";
import { ArmazemDeSessao } from "../auth/sessao.ts";
import { ApiError, ClienteApi } from "./api-cliente.ts";
import { TradutorDeErros } from "./tradutor-de-erros.ts";

// Tudo que o ClienteApi usa entra pelo construtor: nenhum global é trocado neste arquivo.
function montar(resposta: () => Response | Promise<Response>, token: string | null = "tk") {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const dados = new Map<string, string>(token ? [["bik_token", token]] : []);
  const janela = {
    localStorage: {
      getItem: (c: string) => dados.get(c) ?? null,
      setItem: (c: string, v: string) => void dados.set(c, v),
      removeItem: (c: string) => void dados.delete(c),
    },
  } as unknown as JanelaDoNavegador;
  let recusas = 0;
  const cliente = new ClienteApi({
    fetcher: async (url, init) => {
      chamadas.push({ url, init });
      return resposta();
    },
    armazem: new ArmazemDeSessao(() => janela),
    aoNaoAutorizado: () => void recusas++,
  });
  return { cliente, chamadas, dados, get recusas() { return recusas; } };
}
const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status });

test("get manda o token em Authorization e devolve data", async () => {
  const c = montar(() => json(200, { data: [1, 2] }));
  assert.deepEqual(await c.cliente.get("/api/x"), [1, 2]);
  assert.equal((c.chamadas[0].init.headers as Record<string, string>).Authorization, "Bearer tk");
});

test("sem token, não manda Authorization", async () => {
  const c = montar(() => json(200, { data: 1 }), null);
  await c.cliente.get("/api/x");
  assert.equal((c.chamadas[0].init.headers as Record<string, string>).Authorization, undefined);
});

test("put, patch e post usam o método certo e mandam o corpo em JSON", async () => {
  const c = montar(() => json(200, { data: null }));
  await c.cliente.put("/a", { x: 1 });
  await c.cliente.patch("/b", { y: 2 });
  await c.cliente.post("/c", { z: 3 });
  assert.deepEqual(c.chamadas.map((x) => x.init.method), ["PUT", "PATCH", "POST"]);
  assert.deepEqual(c.chamadas.map((x) => x.init.body), ['{"x":1}', '{"y":2}', '{"z":3}']);
});

test("post sem corpo manda {}", async () => {
  const c = montar(() => json(200, { data: null }));
  await c.cliente.post("/api/reservas/r1/cancelar");
  assert.equal(c.chamadas[0].init.body, "{}");
});

test("postJson não manda o token (cadastro e login)", async () => {
  const c = montar(() => json(201, { data: { token: "novo" } }));
  await c.cliente.postJson("/api/auth/login", { email: "a@b.c" });
  assert.equal((c.chamadas[0].init.headers as Record<string, string>).Authorization, undefined);
});

test("401 chama o que foi injetado para tratar a sessão recusada", async () => {
  const c = montar(() => json(401, { error: { code: "UNAUTHORIZED", message: "Sessão expirada." } }));
  await assert.rejects(c.cliente.get("/api/x"), ApiError);
  assert.equal(c.recusas, 1);
});

test("401 com sairSeNaoAutorizado: false não derruba a sessão (senha atual errada)", async () => {
  const c = montar(() => json(401, { error: { code: "UNAUTHORIZED", message: "Senha atual incorreta." } }));
  await assert.rejects(c.cliente.post("/api/conta/senha", {}, { sairSeNaoAutorizado: false }), /Senha atual incorreta/);
  assert.equal(c.recusas, 0);
});

test("só o 401 derruba a sessão: 403, 404 e 500 não", async () => {
  for (const status of [400, 403, 404, 409, 429, 500]) {
    const c = montar(() => json(status, { error: { code: "X", message: "m" } }));
    await assert.rejects(c.cliente.get("/api/x"), ApiError);
    assert.equal(c.recusas, 0, String(status));
  }
});

test("rede caída vira ApiError NETWORK_ERROR com a mensagem de sem conexão", async () => {
  const c = montar(() => Promise.reject(new TypeError("Failed to fetch")));
  await assert.rejects(c.cliente.get("/api/x"), (e: unknown) => e instanceof ApiError && e.code === "NETWORK_ERROR" && e.message === TradutorDeErros.MENSAGEM_SEM_CONEXAO && e.status === 0);
});

test("resposta 204 sem corpo é sucesso com undefined", async () => {
  const c = montar(() => new Response(null, { status: 204 }));
  assert.equal(await c.cliente.post("/api/conta/desativar"), undefined);
});

test("erro sem JSON vira UNKNOWN com o status HTTP guardado", async () => {
  const c = montar(() => new Response("<html>", { status: 404 }));
  await assert.rejects(c.cliente.get("/api/x"), (e: unknown) => e instanceof ApiError && e.code === "UNKNOWN" && e.status === 404);
});

test("erro de validação traz os detalhes por campo", async () => {
  const c = montar(() => json(400, { error: { code: "VALIDATION_ERROR", message: "Dados inválidos.", details: { email: "inválido" } } }));
  await assert.rejects(c.cliente.postJson("/api/auth/cadastro", {}), (e: unknown) => e instanceof ApiError && e.details?.email === "inválido");
});

test("o tradutor injetado decide a mensagem", async () => {
  const cliente = new ClienteApi({
    fetcher: async () => json(500, { error: { code: "INTERNAL_ERROR", message: "x" } }),
    armazem: new ArmazemDeSessao(() => null),
    tradutor: { traduzir: () => "mensagem do teste" } as unknown as TradutorDeErros,
  });
  await assert.rejects(cliente.get("/api/x"), /mensagem do teste/);
});

test("estresse: 200 chamadas ao mesmo tempo, com respostas misturadas, cada uma recebe a sua", async () => {
  let n = 0;
  const c = montar(() => {
    const i = n++ % 4;
    if (i === 0) return json(200, { data: "ok" });
    if (i === 1) return json(404, { error: { code: "NOT_FOUND", message: "n" } });
    if (i === 2) return Promise.reject(new TypeError("rede"));
    return json(401, { error: { code: "UNAUTHORIZED", message: "u" } });
  });
  const resultados = await Promise.all(Array.from({ length: 200 }, () => c.cliente.get("/api/x").then(() => "ok", (e: ApiError) => e.code)));
  assert.equal(resultados.filter((r) => r === "ok").length, 50);
  assert.equal(resultados.filter((r) => r === "NOT_FOUND").length, 50);
  assert.equal(resultados.filter((r) => r === "NETWORK_ERROR").length, 50);
  assert.equal(resultados.filter((r) => r === "UNAUTHORIZED").length, 50);
  assert.equal(c.recusas, 50);
});
