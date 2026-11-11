import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatarReais,
  formatarDataHora,
  formatarPeriodo,
  localParaIso,
  formatarDuracao,
} from "./moeda-e-data.ts";

// ---------- formatarReais ----------

test("formatarReais usa ponto nos milhares e vírgula nos centavos", () => {
  assert.equal(formatarReais(123456), "R$ 1.234,56");
});

test("formatarReais mostra zero e valores abaixo de um real", () => {
  assert.equal(formatarReais(0), "R$ 0,00");
  assert.equal(formatarReais(5), "R$ 0,05");
  assert.equal(formatarReais(5000), "R$ 50,00");
});

test("formatarReais usa espaço comum, não o espaço sem quebra do Intl", () => {
  assert.ok(!formatarReais(100).includes(" "));
});

test("formatarReais recusa valor que não seja centavo inteiro", () => {
  assert.throws(() => formatarReais(10.5), RangeError);
  assert.throws(() => formatarReais(Number.NaN), RangeError);
});

// ---------- formatarDataHora (fuso America/Fortaleza, UTC-3) ----------

test("formatarDataHora converte UTC para o horário de São Luís", () => {
  // contrato: a API devolve 12:00Z para 09:00 local
  assert.equal(formatarDataHora("2026-11-14T12:00:00.000Z"), "14/11/2026 09:00");
});

test("formatarDataHora: 02:30 UTC ainda é 23:30 do dia anterior em São Luís", () => {
  assert.equal(formatarDataHora("2026-11-15T02:30:00.000Z"), "14/11/2026 23:30");
});

test("formatarDataHora aceita Date", () => {
  assert.equal(formatarDataHora(new Date("2026-11-14T12:00:00Z")), "14/11/2026 09:00");
});

test("formatarDataHora não usa horário de verão em nenhuma época do ano", () => {
  assert.equal(formatarDataHora("2026-01-10T15:00:00Z"), "10/01/2026 12:00");
  assert.equal(formatarDataHora("2026-07-10T15:00:00Z"), "10/07/2026 12:00");
});

test("formatarDataHora recusa data inválida", () => {
  assert.throws(() => formatarDataHora("não é data"), RangeError);
});

// ---------- formatarPeriodo ----------

test("formatarPeriodo no mesmo dia local mostra a data uma vez", () => {
  assert.equal(
    formatarPeriodo("2026-11-14T12:00:00.000Z", "2026-11-14T16:00:00.000Z"),
    "14/11/2026, 09:00 às 13:00",
  );
});

test("formatarPeriodo em dias locais diferentes mostra as duas datas", () => {
  assert.equal(
    formatarPeriodo("2026-11-14T12:00:00.000Z", "2026-11-15T12:00:00.000Z"),
    "14/11/2026 09:00 às 15/11/2026 09:00",
  );
});

test("formatarPeriodo compara o dia no fuso local, não em UTC", () => {
  // 23:00 e 23:45 locais de 14/11: em UTC já é dia 15, mas localmente é o mesmo dia
  assert.equal(
    formatarPeriodo("2026-11-15T02:00:00.000Z", "2026-11-15T02:45:00.000Z"),
    "14/11/2026, 23:00 às 23:45",
  );
  // 22:00 local de 14/11 até 00:30 local de 15/11: em UTC é tudo dia 15
  assert.equal(
    formatarPeriodo("2026-11-15T01:00:00.000Z", "2026-11-15T03:30:00.000Z"),
    "14/11/2026 22:00 às 15/11/2026 00:30",
  );
});

// ---------- localParaIso (o que o cliente digita -> ISO com -03:00) ----------

test("localParaIso monta ISO com offset -03:00, no formato do contrato", () => {
  assert.equal(localParaIso("2026-11-14", "09:00"), "2026-11-14T09:00:00-03:00");
});

test("localParaIso 23:30 local é 02:30 UTC do dia seguinte", () => {
  const iso = localParaIso("2026-11-14", "23:30");
  assert.equal(iso, "2026-11-14T23:30:00-03:00");
  assert.equal(new Date(iso).toISOString(), "2026-11-15T02:30:00.000Z");
});

test("localParaIso vira o ano: 31/12 23:30 local é 01/01 em UTC", () => {
  const iso = localParaIso("2026-12-31", "23:30");
  assert.equal(new Date(iso).toISOString(), "2027-01-01T02:30:00.000Z");
});

test("localParaIso 00:00 local é 03:00 UTC do mesmo dia", () => {
  assert.equal(
    new Date(localParaIso("2026-11-14", "00:00")).toISOString(),
    "2026-11-14T03:00:00.000Z",
  );
});

test("localParaIso e formatarDataHora são inversos", () => {
  assert.equal(formatarDataHora(localParaIso("2026-11-14", "23:30")), "14/11/2026 23:30");
});

test("localParaIso recusa formatos fora de AAAA-MM-DD e HH:mm", () => {
  assert.throws(() => localParaIso("14/11/2026", "09:00"), RangeError);
  assert.throws(() => localParaIso("2026-11-14", "9:00"), RangeError);
  assert.throws(() => localParaIso("2026-11-14", "09:00:00"), RangeError);
});

test("localParaIso recusa data e hora que não existem", () => {
  assert.throws(() => localParaIso("2026-02-30", "09:00"), RangeError);
  assert.throws(() => localParaIso("2026-13-01", "09:00"), RangeError);
  assert.throws(() => localParaIso("2026-11-14", "24:00"), RangeError);
  assert.throws(() => localParaIso("2026-11-14", "09:60"), RangeError);
});

// ---------- formatarDuracao ----------

test("formatarDuracao em horas", () => {
  assert.equal(formatarDuracao("2026-11-14T12:00:00Z", "2026-11-14T15:00:00Z"), "3 h");
  assert.equal(formatarDuracao("2026-11-14T12:00:00Z", "2026-11-14T13:00:00Z"), "1 h");
});

test("formatarDuracao em dias, com singular e plural", () => {
  assert.equal(formatarDuracao("2026-11-14T12:00:00Z", "2026-11-15T12:00:00Z"), "1 dia");
  assert.equal(formatarDuracao("2026-11-14T12:00:00Z", "2026-11-16T12:00:00Z"), "2 dias");
});

test("formatarDuracao combina dias, horas e minutos quando não é redondo", () => {
  assert.equal(formatarDuracao("2026-11-14T12:00:00Z", "2026-11-14T13:30:00Z"), "1 h 30 min");
  assert.equal(formatarDuracao("2026-11-14T12:00:00Z", "2026-11-14T12:45:00Z"), "45 min");
  assert.equal(formatarDuracao("2026-11-14T12:00:00Z", "2026-11-15T15:00:00Z"), "1 dia 3 h");
});

test("formatarDuracao funciona com ISO em offsets diferentes", () => {
  assert.equal(
    formatarDuracao("2026-11-14T09:00:00-03:00", "2026-11-14T16:00:00.000Z"),
    "4 h",
  );
});

test("formatarDuracao recusa fim que não é depois do início", () => {
  assert.throws(() => formatarDuracao("2026-11-14T12:00:00Z", "2026-11-14T12:00:00Z"), RangeError);
  assert.throws(() => formatarDuracao("2026-11-14T12:00:00Z", "2026-11-14T11:00:00Z"), RangeError);
});

test("formatarDuracao do dia que atravessa a virada em UTC conta o tempo real", () => {
  // 22:00 local até 01:00 local do dia seguinte = 3 h
  assert.equal(
    formatarDuracao(localParaIso("2026-11-14", "22:00"), localParaIso("2026-11-15", "01:00")),
    "3 h",
  );
});
