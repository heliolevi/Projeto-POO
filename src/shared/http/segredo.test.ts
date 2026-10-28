import assert from "node:assert/strict";
import { test } from "node:test";
import { bearerConfere } from "./segredo.ts";

const SEGREDO = "um-segredo-com-bastante-tamanho";

test("aceita o segredo certo no formato Bearer", () => {
  assert.equal(bearerConfere(`Bearer ${SEGREDO}`, SEGREDO), true);
  assert.equal(bearerConfere(`bearer ${SEGREDO}`, SEGREDO), true);
});

test("recusa segredo errado, de outro tamanho, ou sem header", () => {
  assert.equal(bearerConfere("Bearer outro-segredo-qualquer", SEGREDO), false);
  assert.equal(bearerConfere(`Bearer ${SEGREDO}x`, SEGREDO), false);
  assert.equal(bearerConfere(`Bearer ${SEGREDO.slice(0, -1)}`, SEGREDO), false);
  assert.equal(bearerConfere(null, SEGREDO), false);
  assert.equal(bearerConfere("", SEGREDO), false);
});

test("recusa outros esquemas de autenticação", () => {
  assert.equal(bearerConfere(`Basic ${SEGREDO}`, SEGREDO), false);
  assert.equal(bearerConfere(SEGREDO, SEGREDO), false);
});

test("sem segredo configurado, nada passa (a rota fica desligada)", () => {
  assert.equal(bearerConfere("Bearer ", undefined), false);
  assert.equal(bearerConfere("Bearer undefined", undefined), false);
  assert.equal(bearerConfere("Bearer ", ""), false);
});

test("segredo configurado curto demais é tratado como desligado", () => {
  assert.equal(bearerConfere("Bearer curto", "curto"), false);
  assert.equal(bearerConfere("Bearer 123456789012345", "123456789012345"), false);
  assert.equal(bearerConfere("Bearer 1234567890123456", "1234567890123456"), true);
});
