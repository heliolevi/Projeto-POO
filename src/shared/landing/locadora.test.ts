import assert from "node:assert/strict";
import { test } from "node:test";
import { faixaDeAltura, menorPrecoPorHora, ordenarPorPreco, type TipoPublico } from "./locadora.ts";

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
    ordenarPorPreco(lista).map((t) => t.nome),
    ["Antiga", "Urbana", "Speed"],
  );
  assert.equal(lista[0].nome, "Speed", "não altera a lista original");
});

test("menorPrecoPorHora devolve o mínimo ou null sem tipos", () => {
  assert.equal(menorPrecoPorHora([tipo("A", 2000, 1), tipo("B", 800, 1)]), 800);
  assert.equal(menorPrecoPorHora([]), null);
});

test("faixaDeAltura monta o texto da altura indicada", () => {
  assert.equal(faixaDeAltura(tipo("A", 1, 1)), "Para quem tem de 150 a 195 cm");
});
