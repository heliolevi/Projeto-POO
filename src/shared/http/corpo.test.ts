import assert from "node:assert/strict";
import { test } from "node:test";
import { ipDoCliente, lerTextoLimitado } from "./corpo.ts";
import { PayloadTooLargeError } from "./errors.ts";

const post = (corpo: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/x", { method: "POST", body: corpo, headers });

// Corpo em pedaços e sem Content-Length, como numa requisição com transferência em partes.
function emPedacos(pedacos: string[]) {
  const codificador = new TextEncoder();
  const fluxo = new ReadableStream<Uint8Array>({
    start(controle) {
      for (const p of pedacos) controle.enqueue(codificador.encode(p));
      controle.close();
    },
  });
  return new Request("http://localhost/api/x", {
    method: "POST",
    body: fluxo,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

test("lê o corpo que cabe no limite", async () => {
  assert.equal(await lerTextoLimitado(post('{"a":1}'), 100), '{"a":1}');
});

test("lê acentos e emojis sem corromper", async () => {
  const texto = '{"nome":"São Luís 🚲"}';
  assert.equal(await lerTextoLimitado(post(texto), 1000), texto);
});

test("corpo vazio vira texto vazio", async () => {
  assert.equal(await lerTextoLimitado(new Request("http://localhost/api/x", { method: "POST" }), 10), "");
});

test("corpo exatamente no limite passa; um byte a mais não", async () => {
  assert.equal((await lerTextoLimitado(post("x".repeat(50)), 50)).length, 50);
  await assert.rejects(lerTextoLimitado(post("x".repeat(51)), 50), PayloadTooLargeError);
});

test("Content-Length acima do limite é recusado sem ler o corpo", async () => {
  const requisicao = post("x".repeat(10), { "content-length": "999999" });
  await assert.rejects(lerTextoLimitado(requisicao, 100), PayloadTooLargeError);
  assert.equal(requisicao.bodyUsed, false);
});

test("sem Content-Length, a leitura para quando passa do limite", async () => {
  await assert.rejects(lerTextoLimitado(emPedacos(["a".repeat(40), "b".repeat(40)]), 50), PayloadTooLargeError);
});

test("em pedaços e dentro do limite, junta tudo na ordem", async () => {
  assert.equal(await lerTextoLimitado(emPedacos(["ola, ", "mun", "do"]), 100), "ola, mundo");
});

test("o erro de corpo grande é 413", async () => {
  await assert.rejects(lerTextoLimitado(post("x".repeat(200)), 10), (erro: unknown) => {
    assert.ok(erro instanceof PayloadTooLargeError);
    assert.equal(erro.status, 413);
    return true;
  });
});

test("ipDoCliente prefere o cabeçalho da Vercel e usa o primeiro IP da lista", () => {
  const h = new Headers({
    "x-vercel-forwarded-for": "200.1.1.1, 10.0.0.1",
    "x-forwarded-for": "6.6.6.6",
  });
  assert.equal(ipDoCliente(h), "200.1.1.1");
});

test("ipDoCliente cai para x-forwarded-for, depois x-real-ip, depois 'desconhecido'", () => {
  assert.equal(ipDoCliente(new Headers({ "x-forwarded-for": "7.7.7.7, 8.8.8.8" })), "7.7.7.7");
  assert.equal(ipDoCliente(new Headers({ "x-real-ip": "9.9.9.9" })), "9.9.9.9");
  assert.equal(ipDoCliente(new Headers()), "desconhecido");
});
