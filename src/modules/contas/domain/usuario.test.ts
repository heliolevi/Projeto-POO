import assert from "node:assert/strict";
import { test } from "node:test";
import { PERFIS_SESSAO } from "../../../shared/db/sessao.ts";
import { PERFIS } from "./usuario.ts";

// A camada compartilhada não pode importar módulos, então a lista de perfis do comSessao
// é uma cópia. Este teste garante que as duas continuem iguais (e iguais ao enum do banco).
test("os perfis do módulo contas são os mesmos que o comSessao aceita", () => {
  assert.deepEqual([...PERFIS], [...PERFIS_SESSAO]);
  assert.deepEqual([...PERFIS], ["CLIENTE", "OPERADOR", "ADMIN"]);
});
