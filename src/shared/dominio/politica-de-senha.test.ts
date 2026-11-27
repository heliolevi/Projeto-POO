import { test } from "node:test";
import assert from "node:assert/strict";
import { PoliticaDeSenha } from "./politica-de-senha.ts";

const politica = new PoliticaDeSenha();

const ok = (senha: string) => Object.fromEntries(politica.requisitos(senha).map((r) => [r.id, r.ok]));

test("senha vazia não cumpre nenhum requisito", () => {
  assert.deepEqual(ok(""), { tamanho: false, letra: false, numero: false });
  assert.equal(politica.aceita(""), false);
});

test("cada requisito é conferido separadamente", () => {
  assert.deepEqual(ok("abcdefgh"), { tamanho: true, letra: true, numero: false });
  assert.deepEqual(ok("12345678"), { tamanho: true, letra: false, numero: true });
  assert.deepEqual(ok("abc1"), { tamanho: false, letra: true, numero: true });
});

test("letra acentuada sozinha não conta como letra, igual à API", () => {
  assert.deepEqual(ok("éééé1234"), { tamanho: true, letra: false, numero: true });
  assert.equal(politica.aceita("ééé12345"), false);
  assert.equal(politica.aceita("ção12345"), true); // o "c" é letra comum
});

test("senha com 8 a 128 caracteres, letra e número é aceita", () => {
  assert.equal(politica.aceita("bike2026"), true);
  assert.equal(politica.aceita(`a1${"x".repeat(126)}`), true);
  assert.equal(politica.aceita(`a1${"x".repeat(127)}`), false);
});

test("fronteiras do tamanho: 7 não passa, 8 passa, 128 passa, 129 não passa", () => {
  const tamanho = (n: number) => politica.aceita("a1".padEnd(n, "x"));
  assert.equal(tamanho(7), false);
  assert.equal(tamanho(8), true);
  assert.equal(tamanho(128), true);
  assert.equal(tamanho(129), false);
});

test("senha só de números ou só de letras não é aceita, mesmo com tamanho certo", () => {
  assert.equal(politica.aceita("12345678"), false);
  assert.equal(politica.aceita("abcdefgh"), false);
  assert.equal(politica.aceita("abcdefg1"), true);
});
