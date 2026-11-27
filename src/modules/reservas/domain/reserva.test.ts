import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { RegrasDeReserva, type StatusReserva } from "./reserva.ts";

describe("RegrasDeReserva", () => {
  test("o prazo para pagar é de 15 minutos", () => {
    assert.equal(RegrasDeReserva.PRAZO_PAGAMENTO_MS, 15 * 60 * 1000);
  });

  test("expiraEm é a criação + 15 minutos, só para reserva pendente", () => {
    const criada = new Date("2026-11-14T11:00:00.000Z");
    assert.equal(
      RegrasDeReserva.calcularExpiraEm("PENDENTE_PAGAMENTO", criada)?.toISOString(),
      "2026-11-14T11:15:00.000Z",
    );
    for (const status of RegrasDeReserva.STATUS.filter((s) => s !== "PENDENTE_PAGAMENTO")) {
      assert.equal(RegrasDeReserva.calcularExpiraEm(status, criada), null, status);
    }
  });

  test("calcularExpiraEm não altera a data recebida", () => {
    const criada = new Date("2026-11-14T11:00:00.000Z");
    RegrasDeReserva.calcularExpiraEm("PENDENTE_PAGAMENTO", criada);
    assert.equal(criada.toISOString(), "2026-11-14T11:00:00.000Z");
  });

  test("só pendente e confirmada podem ser canceladas", () => {
    const podem = RegrasDeReserva.STATUS.filter(RegrasDeReserva.podeCancelar);
    assert.deepEqual([...podem].sort(), ["CONFIRMADA", "PENDENTE_PAGAMENTO"]);
  });

  test("podeTransitar lê a tabela de transições, e só para a frente", () => {
    assert.equal(RegrasDeReserva.podeTransitar("PENDENTE_PAGAMENTO", "CONFIRMADA"), true);
    assert.equal(RegrasDeReserva.podeTransitar("CONFIRMADA", "NAO_RETIRADA"), true);
    assert.equal(RegrasDeReserva.podeTransitar("CONFIRMADA", "PENDENTE_PAGAMENTO"), false);
    for (const de of RegrasDeReserva.STATUS) {
      for (const para of RegrasDeReserva.STATUS) {
        assert.equal(RegrasDeReserva.podeTransitar(de, para), RegrasDeReserva.TRANSICOES[de].includes(para), `${de} -> ${para}`);
      }
    }
  });

  test("ehStatus aceita os valores do enum e recusa o resto", () => {
    for (const s of RegrasDeReserva.STATUS) assert.equal(RegrasDeReserva.ehStatus(s), true);
    for (const v of ["", "pendente_pagamento", "ALUGADA", null, undefined, 3, {}, ["CONFIRMADA"]]) {
      assert.equal(RegrasDeReserva.ehStatus(v), false, String(v));
    }
  });

  test("os status do contrato estão todos na lista (e NAO_RETIRADA também, que o banco tem)", () => {
    const esperado: StatusReserva[] = [
      "CANCELADA",
      "CONCLUIDA",
      "CONFIRMADA",
      "EM_ANDAMENTO",
      "EXPIRADA",
      "NAO_RETIRADA",
      "PENDENTE_PAGAMENTO",
    ];
    assert.deepEqual([...RegrasDeReserva.STATUS].sort(), esperado);
  });

  test("só tem membros estáticos: não se cria instância", () => {
    assert.throws(() => new (RegrasDeReserva as unknown as new () => unknown)(), /só tem membros estáticos/);
  });
});
