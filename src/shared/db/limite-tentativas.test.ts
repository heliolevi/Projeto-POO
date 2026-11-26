import assert from "node:assert/strict";
import { test } from "node:test";
import { TooManyRequestsError } from "../http/errors.ts";
import type { ExecutorDeConsultas } from "./executor-de-consultas.ts";
import { LimiteDeTentativas } from "./limite-tentativas.ts";

type Executar = ExecutorDeConsultas["consultar"];
// O limite sobre um banco de mentira (um objeto com o método consultar).
const dos = (consultar: Executar) => new LimiteDeTentativas({ consultar });

// Banco de mentira: guarda a contagem por chave, como a tabela limite_tentativas faria.
function bancoFalso(restante = 600) {
  const contagens = new Map<string, number>();
  const chamadas: { sql: string; valores: unknown[] }[] = [];
  const executar: Executar = async (sql, valores = []) => {
    chamadas.push({ sql, valores });
    const chave = String(valores[0]);
    if (sql.includes("INSERT INTO limite_tentativas")) {
      const novo = (contagens.get(chave) ?? 0) + 1;
      contagens.set(chave, novo);
      return { rows: [{ contagem: novo, restante }] };
    }
    if (sql.startsWith("DELETE FROM limite_tentativas WHERE chave")) contagens.delete(chave);
    return { rows: [] };
  };
  return { executar, contagens, chamadas };
}

const regra = { max: 3, janelaSegundos: 900 };

test("deixa passar até o máximo e barra a tentativa seguinte com 429", async () => {
  const { executar } = bancoFalso(420);
  for (let i = 0; i < 3; i++) await dos(executar).exigirDentroDoLimite("login:ip:1.1.1.1", regra);
  await assert.rejects(dos(executar).exigirDentroDoLimite("login:ip:1.1.1.1", regra), (erro: unknown) => {
    assert.ok(erro instanceof TooManyRequestsError);
    assert.equal(erro.status, 429);
    assert.equal(erro.code, "TOO_MANY_REQUESTS");
    assert.equal(erro.retryAfterSegundos, 420);
    assert.equal(erro.headers?.["Retry-After"], "420");
    return true;
  });
});

test("cada chave tem a sua própria contagem", async () => {
  const { executar } = bancoFalso();
  for (let i = 0; i < 3; i++) await dos(executar).exigirDentroDoLimite("login:ip:1.1.1.1", regra);
  await dos(executar).exigirDentroDoLimite("login:ip:2.2.2.2", regra);
});

test("a janela em segundos vai como parâmetro da consulta", async () => {
  const { executar, chamadas } = bancoFalso();
  await dos(executar).exigirDentroDoLimite("cadastro:ip:3.3.3.3", { max: 10, janelaSegundos: 3600 });
  assert.deepEqual(chamadas[0].valores, ["cadastro:ip:3.3.3.3", 3600]);
});

test("chaves enormes são cortadas em 128 caracteres", async () => {
  const { executar, chamadas } = bancoFalso();
  await dos(executar).exigirDentroDoLimite("x".repeat(500), regra);
  assert.equal(String(chamadas[0].valores[0]).length, 128);
});

test("a chave vai como parâmetro, nunca dentro do texto SQL", async () => {
  const { executar, chamadas } = bancoFalso();
  const maliciosa = "login:ip:1'; DROP TABLE usuario;--";
  await dos(executar).exigirDentroDoLimite(maliciosa, regra);
  assert.ok(!chamadas[0].sql.includes("DROP TABLE"));
  assert.equal(chamadas[0].valores[0], maliciosa);
});

test("limparTentativas zera a chave", async () => {
  const { executar, contagens } = bancoFalso();
  await dos(executar).exigirDentroDoLimite("login:email:abc", regra);
  assert.equal(contagens.get("login:email:abc"), 1);
  await dos(executar).limpar("login:email:abc");
  assert.equal(contagens.has("login:email:abc"), false);
});

test("erro do banco não é engolido (a requisição falha, não passa sem limite)", async () => {
  const quebrado: Executar = async () => {
    throw new Error("banco fora do ar");
  };
  await assert.rejects(dos(quebrado).exigirDentroDoLimite("k", regra), /banco fora do ar/);
});
