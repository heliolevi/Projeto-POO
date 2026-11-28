import assert from "node:assert/strict";
import { test } from "node:test";
import { ScryptDeSenha } from "./senha.ts";

const scrypt = ScryptDeSenha.padrao;
const { HASH_FALSO } = ScryptDeSenha;

test("o hash não contém a senha e usa sal diferente a cada vez", async () => {
  const a = await scrypt.gerarHash("senha1234");
  const b = await scrypt.gerarHash("senha1234");
  assert.ok(a.startsWith("scrypt$"));
  assert.ok(!a.includes("senha1234"));
  assert.notEqual(a, b);
});

test("verificar aceita a senha certa e rejeita a errada", async () => {
  const hash = await scrypt.gerarHash("senha1234");
  assert.equal(await scrypt.verificar("senha1234", hash), true);
  assert.equal(await scrypt.verificar("senha12345", hash), false);
  assert.equal(await scrypt.verificar("senha1234", "lixo"), false);
});

test("o hash falso do login usa os mesmos parâmetros do scrypt em uso", () => {
  const [algoritmo, n, r, p] = HASH_FALSO.split("$");
  assert.equal(algoritmo, "scrypt");
  assert.equal(Number(n), ScryptDeSenha.PARAMETROS.N);
  assert.equal(Number(r), ScryptDeSenha.PARAMETROS.R);
  assert.equal(Number(p), ScryptDeSenha.PARAMETROS.P);
});

test("o hash falso gasta o scrypt inteiro e nunca aceita uma senha", async () => {
  for (const tentativa of ["", "senha1234", "admin", "a".repeat(200)]) {
    assert.equal(await scrypt.verificar(tentativa, HASH_FALSO), false);
  }
  assert.equal(await scrypt.hashParaTempoConstante(), HASH_FALSO);
});

test("pegar o hash falso é instantâneo (não gera hash na primeira chamada)", async () => {
  const inicio = performance.now();
  await scrypt.hashParaTempoConstante();
  assert.ok(performance.now() - inicio < 20, "o hash falso não pode custar o scrypt");
});
