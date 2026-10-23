import assert from "node:assert/strict";
import { test } from "node:test";
import { gerarHashSenha, verificarSenha } from "./senha.ts";

test("o hash não contém a senha e usa sal diferente a cada vez", async () => {
  const a = await gerarHashSenha("senha1234");
  const b = await gerarHashSenha("senha1234");
  assert.ok(a.startsWith("scrypt$"));
  assert.ok(!a.includes("senha1234"));
  assert.notEqual(a, b);
});

test("verificarSenha aceita a senha certa e rejeita a errada", async () => {
  const hash = await gerarHashSenha("senha1234");
  assert.equal(await verificarSenha("senha1234", hash), true);
  assert.equal(await verificarSenha("senha12345", hash), false);
  assert.equal(await verificarSenha("senha1234", "lixo"), false);
});
