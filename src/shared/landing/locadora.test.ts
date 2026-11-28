import assert from "node:assert/strict";
import { test } from "node:test";
import { LOCADORA, TiposDaVitrine, type TipoPublico } from "./locadora.ts";

function tipo(nome: string, hora: number, dia: number): TipoPublico {
  return {
    id: nome,
    nome,
    descricao: null,
    atividades: [],
    alturaMinCm: 150,
    alturaMaxCm: 195,
    nivelRecomendado: "INICIANTE",
    precoHoraCentavos: hora,
    precoDiaCentavos: dia,
    valorCaucaoCentavos: 15000,
  };
}

test("ordena pela diária e desempata pelo nome", () => {
  const lista = [tipo("Speed", 2500, 12000), tipo("Urbana", 1000, 5000), tipo("Antiga", 1000, 5000)];
  assert.deepEqual(
    TiposDaVitrine.ordenarPorPreco(lista).map((t) => t.nome),
    ["Antiga", "Urbana", "Speed"],
  );
  assert.equal(lista[0].nome, "Speed", "não altera a lista original");
});

test("TiposDaVitrine.menorPrecoPorHora devolve o mínimo ou null sem tipos", () => {
  assert.equal(TiposDaVitrine.menorPrecoPorHora([tipo("A", 2000, 1), tipo("B", 800, 1)]), 800);
  assert.equal(TiposDaVitrine.menorPrecoPorHora([]), null);
});

test("TiposDaVitrine.faixaDeAltura monta o texto da altura indicada", () => {
  assert.equal(TiposDaVitrine.faixaDeAltura(tipo("A", 1, 1)), "Para quem tem de 150 a 195 cm");
});

test("LOCADORA não guarda endereço, telefone, e-mail nem horários: esses dados vêm de GET /api/empresa", () => {
  // Uma cópia aqui envelhece e passa a divergir do banco (era o que as telas faziam antes).
  assert.deepEqual(Object.keys(LOCADORA).sort(), ["documentosNaRetirada", "nome"]);
});

test("TiposDaVitrine só tem métodos estáticos e não altera a lista recebida", () => {
  assert.throws(() => new (TiposDaVitrine as unknown as new () => unknown)(), /só tem métodos estáticos/);
  const lista = [tipo("B", 2000, 1), tipo("A", 1000, 1)];
  const nomes = lista.map((t) => t.nome);
  TiposDaVitrine.ordenarPorPreco(lista);
  assert.deepEqual(lista.map((t) => t.nome), nomes);
});
