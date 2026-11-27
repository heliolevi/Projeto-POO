import assert from "node:assert/strict";
import { test } from "node:test";
import { ClienteDaRequisicao } from "./cliente-da-requisicao.ts";

test("prefere o cabeçalho da Vercel e usa o primeiro IP da lista", () => {
  const h = new Headers({ "x-vercel-forwarded-for": "200.1.1.1, 10.0.0.1", "x-forwarded-for": "6.6.6.6" });
  assert.equal(new ClienteDaRequisicao(h).ip, "200.1.1.1");
});

test("cai para x-forwarded-for, depois x-real-ip, depois 'desconhecido'", () => {
  assert.equal(new ClienteDaRequisicao(new Headers({ "x-forwarded-for": "7.7.7.7, 8.8.8.8" })).ip, "7.7.7.7");
  assert.equal(new ClienteDaRequisicao(new Headers({ "x-real-ip": "9.9.9.9" })).ip, "9.9.9.9");
  assert.equal(new ClienteDaRequisicao(new Headers()).ip, "desconhecido");
});

test("tira os espaços em volta do IP", () => {
  assert.equal(new ClienteDaRequisicao(new Headers({ "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" })).ip, "1.2.3.4");
  assert.equal(new ClienteDaRequisicao(new Headers({ "x-real-ip": "  9.9.9.9 " })).ip, "9.9.9.9");
});

test("cabeçalho vazio é ignorado e vale o seguinte", () => {
  assert.equal(new ClienteDaRequisicao(new Headers({ "x-vercel-forwarded-for": "", "x-real-ip": "9.9.9.9" })).ip, "9.9.9.9");
});

test("é encapsulado: nenhum campo visível", () => {
  assert.deepEqual(Object.keys(new ClienteDaRequisicao(new Headers())), []);
});
