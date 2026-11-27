import assert from "node:assert/strict";
import { test } from "node:test";
import { Ambiente } from "./ambiente.ts";

test("exigir devolve o valor da variável", () => {
  assert.equal(new Ambiente({ A: "1" }).exigir("A"), "1");
});

test("exigir lança se a variável não existe ou está vazia, dizendo o nome", () => {
  const amb = new Ambiente({ VAZIA: "", INDEFINIDA: undefined });
  for (const nome of ["VAZIA", "INDEFINIDA", "NAO_EXISTE"]) {
    assert.throws(() => amb.exigir(nome), new Error(`Variável de ambiente ausente: ${nome}`));
  }
});

test("opcional devolve undefined em vez de lançar", () => {
  const amb = new Ambiente({ A: "1", VAZIA: "" });
  assert.equal(amb.opcional("A"), "1");
  assert.equal(amb.opcional("VAZIA"), undefined);
  assert.equal(amb.opcional("NAO_EXISTE"), undefined);
});

test("não deixa ler variável herdada do objeto (toString, constructor)", () => {
  const amb = new Ambiente(Object.create(null) as Record<string, string>);
  assert.equal(amb.opcional("toString"), undefined);
  assert.throws(() => amb.exigir("constructor"));
});

test("Ambiente.padrao lê o process.env de verdade", () => {
  process.env.TESTE_AMBIENTE_PADRAO = "ola";
  try {
    assert.equal(Ambiente.padrao.exigir("TESTE_AMBIENTE_PADRAO"), "ola");
  } finally {
    delete process.env.TESTE_AMBIENTE_PADRAO;
  }
});
