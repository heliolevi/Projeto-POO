import assert from "node:assert/strict";
import { test } from "node:test";
import { PayloadTooLargeError, ValidationError } from "./errors.ts";
import { LeitorDeCorpo } from "./leitor-de-corpo.ts";

const post = (corpo: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/x", { method: "POST", body: corpo, headers });
const pedido = (corpo: string | undefined) => new Request("http://localhost/api/x", { method: "POST", body: corpo });

// Corpo em pedaços e sem Content-Length, como numa requisição com transferência em partes.
function emPedacos(pedacos: string[]) {
  const codificador = new TextEncoder();
  const fluxo = new ReadableStream<Uint8Array>({
    start(controle) {
      for (const p of pedacos) controle.enqueue(codificador.encode(p));
      controle.close();
    },
  });
  return new Request("http://localhost/api/x", { method: "POST", body: fluxo, duplex: "half" } as RequestInit & { duplex: "half" });
}

test("o limite padrão é de 16 KiB e pode ser escolhido no construtor", () => {
  assert.equal(new LeitorDeCorpo().maxBytes, 16 * 1024);
  assert.equal(new LeitorDeCorpo(50).maxBytes, 50);
});

test("o limite precisa ser um inteiro positivo", () => {
  for (const ruim of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => new LeitorDeCorpo(ruim), RangeError, String(ruim));
});

test("lerTexto lê o corpo que cabe no limite", async () => {
  assert.equal(await new LeitorDeCorpo(100).lerTexto(post('{"a":1}')), '{"a":1}');
});

test("lerTexto lê acentos e emojis sem corromper", async () => {
  const texto = '{"nome":"São Luís 🚲"}';
  assert.equal(await new LeitorDeCorpo(1000).lerTexto(post(texto)), texto);
});

test("lerTexto: corpo vazio vira texto vazio", async () => {
  assert.equal(await new LeitorDeCorpo(10).lerTexto(new Request("http://localhost/api/x", { method: "POST" })), "");
});

test("lerTexto: corpo exatamente no limite passa; um byte a mais não", async () => {
  const leitor = new LeitorDeCorpo(50);
  assert.equal((await leitor.lerTexto(post("x".repeat(50)))).length, 50);
  await assert.rejects(leitor.lerTexto(post("x".repeat(51))), PayloadTooLargeError);
});

test("lerTexto: Content-Length acima do limite é recusado sem ler o corpo", async () => {
  const requisicao = post("x".repeat(10), { "content-length": "999999" });
  await assert.rejects(new LeitorDeCorpo(100).lerTexto(requisicao), PayloadTooLargeError);
  assert.equal(requisicao.bodyUsed, false);
});

test("lerTexto: sem Content-Length, a leitura para quando passa do limite", async () => {
  await assert.rejects(new LeitorDeCorpo(50).lerTexto(emPedacos(["a".repeat(40), "b".repeat(40)])), PayloadTooLargeError);
});

test("lerTexto: em pedaços e dentro do limite, junta tudo na ordem", async () => {
  assert.equal(await new LeitorDeCorpo(100).lerTexto(emPedacos(["ola, ", "mun", "do"])), "ola, mundo");
});

test("o erro de corpo grande é 413", async () => {
  await assert.rejects(new LeitorDeCorpo(10).lerTexto(post("x".repeat(200))), (erro: unknown) => {
    assert.ok(erro instanceof PayloadTooLargeError);
    assert.equal(erro.status, 413);
    return true;
  });
});

test("lerJson lê um JSON válido", async () => {
  const leitor = new LeitorDeCorpo();
  assert.deepEqual(await leitor.lerJson(pedido('{"a":1}')), { a: 1 });
  assert.deepEqual(await leitor.lerJson(pedido("[1,2]")), [1, 2]);
});

test("lerJson: JSON quebrado ou corpo vazio responde 400", async () => {
  const leitor = new LeitorDeCorpo();
  await assert.rejects(leitor.lerJson(pedido("{oops")), ValidationError);
  await assert.rejects(leitor.lerJson(pedido(undefined)), ValidationError);
  await assert.rejects(leitor.lerJson(pedido("")), ValidationError);
});

test("lerJson: corpo acima do limite responde 413", async () => {
  await assert.rejects(new LeitorDeCorpo(50).lerJson(pedido(JSON.stringify({ x: "a".repeat(100) }))), PayloadTooLargeError);
});

test("lerJson: o limite padrão de 16 KiB aceita o que cabe e recusa o que passa", async () => {
  const leitor = new LeitorDeCorpo();
  const dentro = JSON.stringify({ x: "a".repeat(16 * 1024 - 20) });
  assert.ok(dentro.length < 16 * 1024);
  assert.equal(typeof (await leitor.lerJson(pedido(dentro))), "object");
  await assert.rejects(leitor.lerJson(pedido(JSON.stringify({ x: "a".repeat(16 * 1024) }))), PayloadTooLargeError);
});

test("um leitor serve a várias requisições sem guardar estado entre elas", async () => {
  const leitor = new LeitorDeCorpo(50);
  await assert.rejects(leitor.lerTexto(post("x".repeat(60))), PayloadTooLargeError);
  assert.equal(await leitor.lerTexto(post("ok")), "ok");
});
