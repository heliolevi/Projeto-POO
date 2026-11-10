import assert from "node:assert/strict";
import { test } from "node:test";
import { validarBusca } from "./periodo.ts";

// "agora" fixo: 14/11/2026, 08:00 em São Luís
const AGORA = new Date("2026-11-14T11:00:00.000Z");

test("aceita um período válido no fuso de São Luís e devolve em UTC", () => {
  const r = validarBusca(
    { inicio: "2026-11-14T09:00:00-03:00", fim: "2026-11-14T13:00:00-03:00", atividade: "PASSEIO" },
    AGORA,
  );
  assert.ok("dados" in r);
  assert.equal(r.dados.inicio.toISOString(), "2026-11-14T12:00:00.000Z");
  assert.equal(r.dados.fim.toISOString(), "2026-11-14T16:00:00.000Z");
  assert.equal(r.dados.atividade, "PASSEIO");
});

test("atividade é opcional", () => {
  for (const atividade of [undefined, null, ""]) {
    const r = validarBusca({ inicio: "2026-11-14T12:00:00Z", fim: "2026-11-14T13:00:00Z", atividade }, AGORA);
    assert.ok("dados" in r);
    assert.equal(r.dados.atividade, null);
  }
});

test("exige data e hora com fuso", () => {
  for (const inicio of [undefined, "", "amanhã", "2026-11-14", "2026-11-14T09:00:00", "2026-13-40T09:00:00Z", 1763118000000]) {
    const r = validarBusca({ inicio, fim: "2026-11-14T16:00:00Z" }, AGORA);
    assert.ok("erros" in r, String(inicio));
    assert.ok(r.erros.inicio);
  }
});

test("o início não pode estar no passado, com 5 minutos de folga", () => {
  const passado = validarBusca({ inicio: "2026-11-14T10:00:00Z", fim: "2026-11-14T12:00:00Z" }, AGORA);
  assert.ok("erros" in passado);
  assert.match(passado.erros.inicio, /passado/);
  const agoraMesmo = validarBusca({ inicio: "2026-11-14T10:57:00Z", fim: "2026-11-14T12:00:00Z" }, AGORA);
  assert.ok("dados" in agoraMesmo);
});

test("o fim precisa vir depois do início, com período de 1 hora a 7 dias", () => {
  const casos: [string, RegExp | null][] = [
    ["2026-11-14T12:00:00Z", /depois/],
    ["2026-11-14T11:30:00Z", /depois/],
    ["2026-11-14T12:59:00Z", /mínimo/],
    ["2026-11-14T13:00:00Z", null],
    ["2026-11-21T12:00:00Z", null],
    ["2026-11-21T12:00:01Z", /máximo/],
  ];
  for (const [fim, esperado] of casos) {
    const r = validarBusca({ inicio: "2026-11-14T12:00:00Z", fim }, AGORA);
    if (esperado === null) assert.ok("dados" in r, fim);
    else {
      assert.ok("erros" in r, fim);
      assert.match(r.erros.fim, esperado);
    }
  }
});

test("atividade fora da enumeração é recusada", () => {
  for (const atividade of ["passeio", "CORRIDA", 3, ["PASSEIO"]]) {
    const r = validarBusca({ inicio: "2026-11-14T12:00:00Z", fim: "2026-11-14T13:00:00Z", atividade }, AGORA);
    assert.ok("erros" in r, JSON.stringify(atividade));
    assert.ok(r.erros.atividade);
  }
});

test("devolve todos os erros de uma vez", () => {
  const r = validarBusca({ inicio: "x", fim: "y", atividade: "z" }, AGORA);
  assert.ok("erros" in r);
  assert.deepEqual(Object.keys(r.erros).sort(), ["atividade", "fim", "inicio"]);
});
