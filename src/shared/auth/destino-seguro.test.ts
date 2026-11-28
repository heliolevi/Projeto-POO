import assert from "node:assert/strict";
import { test } from "node:test";
import { DestinoSeguro } from "./destino-seguro.ts";

test("mantém caminhos internos", () => {
  assert.equal(new DestinoSeguro().resolver("/perfil"), "/perfil");
  assert.equal(new DestinoSeguro().resolver("/buscar?q=bike"), "/buscar?q=bike");
  assert.equal(new DestinoSeguro().resolver("/minhas-reservas?x=1&y=2"), "/minhas-reservas?x=1&y=2");
});

test("usa o padrão quando não há destino", () => {
  assert.equal(new DestinoSeguro().resolver(null), "/app");
  assert.equal(new DestinoSeguro().resolver(""), "/app");
});

test("recusa destinos externos ou fora do formato", () => {
  assert.equal(new DestinoSeguro().resolver("https://evil.com"), "/app");
  assert.equal(new DestinoSeguro().resolver("perfil"), "/app");
  assert.equal(new DestinoSeguro().resolver("//evil.com"), "/app");
  assert.equal(new DestinoSeguro().resolver("/\\evil.com"), "/app");
  assert.equal(new DestinoSeguro().resolver("/a\\b"), "/app");
});

test("recusa tab e quebra de linha, que o navegador remove ao interpretar a URL", () => {
  assert.equal(new DestinoSeguro().resolver("/\t/evil.com"), "/app");
  assert.equal(new DestinoSeguro().resolver("/\n/evil.com"), "/app");
  assert.equal(new DestinoSeguro().resolver("/\r/evil.com"), "/app");
});

test("não confunde o %09 já codificado com um tab de verdade", () => {
  assert.equal(new DestinoSeguro().resolver("/%09/evil.com"), "/%09/evil.com");
});
