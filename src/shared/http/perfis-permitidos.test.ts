import assert from "node:assert/strict";
import { test } from "node:test";
import { ForbiddenError } from "./errors.ts";
import { PerfisPermitidos } from "./perfis-permitidos.ts";

const sessao = (perfil: "CLIENTE" | "OPERADOR" | "ADMIN") => ({ usuarioId: "u1", perfil });

test("devolve a mesma sessão quando o perfil é permitido", () => {
  const s = sessao("ADMIN");
  assert.equal(new PerfisPermitidos("ADMIN").exigir(s), s);
});

test("403 quando o perfil não é permitido", () => {
  const soAdmin = new PerfisPermitidos("ADMIN");
  for (const perfil of ["CLIENTE", "OPERADOR"] as const) {
    assert.throws(() => soAdmin.exigir(sessao(perfil)), (erro: unknown) => erro instanceof ForbiddenError && erro.status === 403, perfil);
  }
});

test("aceita mais de um perfil", () => {
  const equipe = new PerfisPermitidos("OPERADOR", "ADMIN");
  assert.ok(equipe.exigir(sessao("OPERADOR")));
  assert.ok(equipe.exigir(sessao("ADMIN")));
  assert.throws(() => equipe.exigir(sessao("CLIENTE")), ForbiddenError);
});

test("permite diz sim ou não sem lançar, e visitante (perfil nulo) nunca passa", () => {
  const cliente = new PerfisPermitidos("CLIENTE");
  assert.equal(cliente.permite("CLIENTE"), true);
  assert.equal(cliente.permite("ADMIN"), false);
  assert.equal(cliente.permite(null), false);
});

test("perfil desconhecido não passa (token de uma versão antiga)", () => {
  const s = { usuarioId: "u1", perfil: "GERENTE_LOCADORA" as never };
  assert.throws(() => new PerfisPermitidos("ADMIN", "OPERADOR", "CLIENTE").exigir(s), ForbiddenError);
});

test("a lista de perfis não muda depois de criada", () => {
  const lista: ["ADMIN"] = ["ADMIN"];
  const p = new PerfisPermitidos(...lista);
  lista[0] = "CLIENTE" as never;
  assert.equal(p.permite("ADMIN"), true);
  assert.equal(p.permite("CLIENTE"), false);
});
