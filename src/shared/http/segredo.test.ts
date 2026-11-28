import assert from "node:assert/strict";
import { test } from "node:test";
import { SegredoBearer } from "./segredo.ts";

const SEGREDO = "um-segredo-com-bastante-tamanho";
const confere = (authorization: string | null, esperado: string | undefined) => new SegredoBearer(esperado).confere(authorization);

test("aceita o segredo certo no formato Bearer", () => {
  assert.equal(confere(`Bearer ${SEGREDO}`, SEGREDO), true);
  assert.equal(confere(`bearer ${SEGREDO}`, SEGREDO), true);
});

test("recusa segredo errado, de outro tamanho, ou sem header", () => {
  assert.equal(confere("Bearer outro-segredo-qualquer", SEGREDO), false);
  assert.equal(confere(`Bearer ${SEGREDO}x`, SEGREDO), false);
  assert.equal(confere(`Bearer ${SEGREDO.slice(0, -1)}`, SEGREDO), false);
  assert.equal(confere(null, SEGREDO), false);
  assert.equal(confere("", SEGREDO), false);
});

test("recusa outros esquemas de autenticação", () => {
  assert.equal(confere(`Basic ${SEGREDO}`, SEGREDO), false);
  assert.equal(confere(SEGREDO, SEGREDO), false);
});

test("sem segredo configurado, nada passa (a rota fica desligada)", () => {
  assert.equal(confere("Bearer ", undefined), false);
  assert.equal(confere("Bearer undefined", undefined), false);
  assert.equal(confere("Bearer ", ""), false);
});

test("segredo configurado curto demais é tratado como desligado", () => {
  assert.equal(confere("Bearer curto", "curto"), false);
  assert.equal(confere("Bearer 123456789012345", "123456789012345"), false);
  assert.equal(confere("Bearer 1234567890123456", "1234567890123456"), true);
});

test("ativo diz se a rota está ligada", () => {
  assert.equal(new SegredoBearer(undefined).ativo, false);
  assert.equal(new SegredoBearer("").ativo, false);
  assert.equal(new SegredoBearer("1".repeat(SegredoBearer.TAMANHO_MINIMO - 1)).ativo, false);
  assert.equal(new SegredoBearer("1".repeat(SegredoBearer.TAMANHO_MINIMO)).ativo, true);
});

test("o segredo não aparece em nenhum campo visível nem no JSON", () => {
  const s = new SegredoBearer(SEGREDO);
  assert.deepEqual(Object.keys(s), []);
  assert.equal(JSON.stringify(s), "{}");
});
