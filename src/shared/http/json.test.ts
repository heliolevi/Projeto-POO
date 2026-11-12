import assert from "node:assert/strict";
import { test } from "node:test";
import { PayloadTooLargeError, ValidationError } from "./errors.ts";
import { lerJson } from "./json.ts";

const pedido = (corpo: string | undefined) =>
  new Request("http://localhost/api/x", { method: "POST", body: corpo });

test("lê um JSON válido", async () => {
  assert.deepEqual(await lerJson(pedido('{"a":1}')), { a: 1 });
  assert.deepEqual(await lerJson(pedido("[1,2]")), [1, 2]);
});

test("JSON quebrado ou corpo vazio responde 400", async () => {
  await assert.rejects(lerJson(pedido("{oops")), ValidationError);
  await assert.rejects(lerJson(pedido(undefined)), ValidationError);
  await assert.rejects(lerJson(pedido("")), ValidationError);
});

test("corpo acima do limite responde 413, sem ler o resto", async () => {
  await assert.rejects(lerJson(pedido(JSON.stringify({ x: "a".repeat(100) })), 50), PayloadTooLargeError);
});

test("o limite padrão é de 16 KiB", async () => {
  const dentro = JSON.stringify({ x: "a".repeat(16 * 1024 - 20) });
  assert.ok(dentro.length < 16 * 1024);
  assert.equal(typeof (await lerJson(pedido(dentro))), "object");
  await assert.rejects(lerJson(pedido(JSON.stringify({ x: "a".repeat(16 * 1024) }))), PayloadTooLargeError);
});
