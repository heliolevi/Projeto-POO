import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { lerSessao } from "./sessao.ts";

const b64 = (dados: string) => Buffer.from(dados).toString("base64url");

function montarToken(corpo: unknown): string {
  const vazio = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const parte2 = typeof corpo === "string" ? corpo : b64(JSON.stringify(corpo));
  return `${vazio}.${parte2}.assinatura-qualquer`;
}

function criarStorageFalso() {
  const dados = new Map<string, string>();
  return {
    getItem: (chave: string) => dados.get(chave) ?? null,
    setItem: (chave: string, valor: string) => dados.set(chave, valor),
    removeItem: (chave: string) => dados.delete(chave),
  };
}

let janelaAnterior: unknown;
before(() => {
  janelaAnterior = (globalThis as Record<string, unknown>).window;
});
after(() => {
  (globalThis as Record<string, unknown>).window = janelaAnterior;
});
beforeEach(() => {
  (globalThis as Record<string, unknown>).window = { localStorage: criarStorageFalso() };
});

const agora = () => Math.floor(Date.now() / 1000);

test("token válido com perfil conhecido é lido", () => {
  window.localStorage.setItem(
    "bik_token",
    montarToken({ sub: "u1", perfil: "CLIENTE", exp: agora() + 3600 }),
  );
  const sessao = lerSessao();
  assert.equal(sessao?.usuarioId, "u1");
  assert.equal(sessao?.perfil, "CLIENTE");
});

test("token expirado é recusado", () => {
  window.localStorage.setItem(
    "bik_token",
    montarToken({ sub: "u1", perfil: "CLIENTE", exp: agora() - 10 }),
  );
  assert.equal(lerSessao(), null);
});

test("token malformado é recusado", () => {
  window.localStorage.setItem("bik_token", "nao-e-um-jwt");
  assert.equal(lerSessao(), null);
});

test("token sem perfil é recusado", () => {
  window.localStorage.setItem("bik_token", montarToken({ sub: "u1", exp: agora() + 3600 }));
  assert.equal(lerSessao(), null);
});

test("token com perfil desconhecido (modelo antigo) é recusado", () => {
  window.localStorage.setItem(
    "bik_token",
    montarToken({ sub: "u1", perfil: "GERENTE_LOCADORA", exp: agora() + 3600 }),
  );
  assert.equal(lerSessao(), null);
});

test("token sem exp é recusado", () => {
  window.localStorage.setItem("bik_token", montarToken({ sub: "u1", perfil: "CLIENTE" }));
  assert.equal(lerSessao(), null);
});

test("sem token salvo, não há sessão", () => {
  assert.equal(lerSessao(), null);
});
