import assert from "node:assert/strict";
import { test } from "node:test";
import { destinoSeguro } from "./destino-seguro.ts";

test("mantém caminhos internos", () => {
  assert.equal(destinoSeguro("/perfil"), "/perfil");
  assert.equal(destinoSeguro("/buscar?q=bike"), "/buscar?q=bike");
  assert.equal(destinoSeguro("/minhas-reservas?x=1&y=2"), "/minhas-reservas?x=1&y=2");
});

test("usa o padrão quando não há destino", () => {
  assert.equal(destinoSeguro(null), "/app");
  assert.equal(destinoSeguro(""), "/app");
});

test("recusa destinos externos ou fora do formato", () => {
  assert.equal(destinoSeguro("https://evil.com"), "/app");
  assert.equal(destinoSeguro("perfil"), "/app");
  assert.equal(destinoSeguro("//evil.com"), "/app");
  assert.equal(destinoSeguro("/\\evil.com"), "/app");
  assert.equal(destinoSeguro("/a\\b"), "/app");
});

test("recusa tab e quebra de linha, que o navegador remove ao interpretar a URL", () => {
  assert.equal(destinoSeguro("/\t/evil.com"), "/app");
  assert.equal(destinoSeguro("/\n/evil.com"), "/app");
  assert.equal(destinoSeguro("/\r/evil.com"), "/app");
});

test("não confunde o %09 já codificado com um tab de verdade", () => {
  assert.equal(destinoSeguro("/%09/evil.com"), "/%09/evil.com");
});
