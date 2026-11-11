import assert from "node:assert/strict";
import { test } from "node:test";
import { destinoSeguro } from "./destino-seguro.ts";

test("mantém caminhos internos", () => {
  assert.equal(destinoSeguro("/perfil"), "/perfil");
  assert.equal(destinoSeguro("/buscar?q=bike"), "/buscar?q=bike");
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
