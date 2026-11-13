import { test } from "node:test";
import assert from "node:assert/strict";
import { horariosDoDia, proximosDias, retiradaEDevolucao } from "./agenda.ts";

// 14/11/2026 é um sábado. 15:00 UTC = 12:00 em São Luís.
const SABADO_MEIO_DIA = new Date("2026-11-14T15:00:00Z");

test("proximosDias começa hoje em São Luís, com Hoje e Amanhã em destaque", () => {
  const dias = proximosDias(SABADO_MEIO_DIA, 3);
  assert.deepEqual(
    dias.map((d) => [d.valor, d.semana, d.dia, d.mes, d.destaque]),
    [
      ["2026-11-14", "sáb", "14", "nov", "Hoje"],
      ["2026-11-15", "dom", "15", "nov", "Amanhã"],
      ["2026-11-16", "seg", "16", "nov", null],
    ],
  );
  assert.equal(dias[1].descricao, "domingo, 15 de novembro");
});

test("proximosDias usa o dia de São Luís, não o UTC, perto da meia-noite", () => {
  // 02:00 UTC do dia 15 ainda é 23:00 do dia 14 em São Luís.
  assert.equal(proximosDias(new Date("2026-11-15T02:00:00Z"), 1)[0].valor, "2026-11-14");
});

test("proximosDias atravessa a virada do mês e do ano", () => {
  const dias = proximosDias(new Date("2026-12-31T15:00:00Z"), 2);
  assert.deepEqual(
    dias.map((d) => d.valor),
    ["2026-12-31", "2027-01-01"],
  );
  assert.equal(dias[1].mes, "jan");
  assert.equal(proximosDias(SABADO_MEIO_DIA).length, 14);
});

test("horariosDoDia segue o horário do balcão de cada dia da semana", () => {
  const madrugada = new Date("2026-11-13T09:00:00Z"); // 06:00 de sexta, antes de abrir
  assert.deepEqual(horariosDoDia("2026-11-16", madrugada).slice(0, 2), ["08:00", "09:00"]); // segunda
  assert.equal(horariosDoDia("2026-11-16", madrugada).at(-1), "17:00");
  assert.equal(horariosDoDia("2026-11-14", madrugada).at(-1), "15:00"); // sábado fecha às 16h
  assert.equal(horariosDoDia("2026-11-15", madrugada).at(-1), "13:00"); // domingo fecha às 14h
});

test("horariosDoDia tira do dia de hoje os horários que já passaram", () => {
  // 12:00 de sábado: 12:00 já não vale (precisa ser no futuro); sobra das 13h às 15h.
  assert.deepEqual(horariosDoDia("2026-11-14", SABADO_MEIO_DIA), ["13:00", "14:00", "15:00"]);
});

test("horariosDoDia devolve lista vazia para dia passado ou data inválida", () => {
  assert.deepEqual(horariosDoDia("2026-11-10", SABADO_MEIO_DIA), []);
  assert.deepEqual(horariosDoDia("", SABADO_MEIO_DIA), []);
  assert.deepEqual(horariosDoDia("2026-13-40", SABADO_MEIO_DIA), []);
  assert.deepEqual(horariosDoDia("2026-02-30", SABADO_MEIO_DIA), []);
});

test("retiradaEDevolucao monta as duas pontas do bilhete", () => {
  assert.deepEqual(retiradaEDevolucao("2026-11-14", "09:00", 240), {
    retirada: { hora: "09:00", dia: "sáb, 14 nov" },
    devolucao: { hora: "13:00", dia: "sáb, 14 nov" },
  });
});

test("retiradaEDevolucao passa para o dia seguinte em aluguéis longos", () => {
  const periodo = retiradaEDevolucao("2026-11-14", "15:00", 1440);
  assert.deepEqual(periodo?.devolucao, { hora: "15:00", dia: "dom, 15 nov" });
});

test("retiradaEDevolucao recusa data, hora ou duração inválidas", () => {
  assert.equal(retiradaEDevolucao("", "09:00", 60), null);
  assert.equal(retiradaEDevolucao("2026-11-14", "", 60), null);
  assert.equal(retiradaEDevolucao("2026-02-30", "09:00", 60), null);
  assert.equal(retiradaEDevolucao("2026-11-14", "09:00", 0), null);
  assert.equal(retiradaEDevolucao("2026-11-14", "09:00", Number.NaN), null);
});
