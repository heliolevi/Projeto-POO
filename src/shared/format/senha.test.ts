import { test } from "node:test";
import assert from "node:assert/strict";
import { requisitosDaSenha, senhaAceita } from "./senha.ts";

const ok = (senha: string) => Object.fromEntries(requisitosDaSenha(senha).map((r) => [r.id, r.ok]));

test("senha vazia não cumpre nenhum requisito", () => {
  assert.deepEqual(ok(""), { tamanho: false, letra: false, numero: false });
  assert.equal(senhaAceita(""), false);
});

test("cada requisito é conferido separadamente", () => {
  assert.deepEqual(ok("abcdefgh"), { tamanho: true, letra: true, numero: false });
  assert.deepEqual(ok("12345678"), { tamanho: true, letra: false, numero: true });
  assert.deepEqual(ok("abc1"), { tamanho: false, letra: true, numero: true });
});

test("letra acentuada sozinha não conta como letra, igual à API", () => {
  assert.deepEqual(ok("éééé1234"), { tamanho: true, letra: false, numero: true });
  assert.equal(senhaAceita("ééé12345"), false);
  assert.equal(senhaAceita("ção12345"), true); // o "c" é letra comum
});

test("senha com 8 a 128 caracteres, letra e número é aceita", () => {
  assert.equal(senhaAceita("bike2026"), true);
  assert.equal(senhaAceita(`a1${"x".repeat(126)}`), true);
  assert.equal(senhaAceita(`a1${"x".repeat(127)}`), false);
});
