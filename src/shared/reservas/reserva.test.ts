import assert from "node:assert/strict";
import { test } from "node:test";
import { ContagemDoPrazo, StatusDaReserva } from "./reserva.ts";

const agora = new Date("2026-11-14T11:00:00.000Z");

test("ContagemDoPrazo.segundosRestantes conta até o prazo e nunca fica negativo", () => {
  assert.equal(ContagemDoPrazo.segundosRestantes("2026-11-14T11:15:00.000Z", agora), 900);
  assert.equal(ContagemDoPrazo.segundosRestantes("2026-11-14T10:59:00.000Z", agora), 0);
  assert.equal(ContagemDoPrazo.segundosRestantes(null, agora), 0);
  assert.equal(ContagemDoPrazo.segundosRestantes("data-invalida", agora), 0);
});

test("ContagemDoPrazo.formatar mostra mm:ss", () => {
  assert.equal(ContagemDoPrazo.formatar(900), "15:00");
  assert.equal(ContagemDoPrazo.formatar(65), "01:05");
  assert.equal(ContagemDoPrazo.formatar(0), "00:00");
});

test("só reservas pendentes ou confirmadas podem ser canceladas", () => {
  assert.equal(StatusDaReserva.podeCancelar("PENDENTE_PAGAMENTO"), true);
  assert.equal(StatusDaReserva.podeCancelar("CONFIRMADA"), true);
  for (const s of ["EM_ANDAMENTO", "CONCLUIDA", "CANCELADA", "EXPIRADA"] as const) {
    assert.equal(StatusDaReserva.podeCancelar(s), false);
  }
});

test("StatusDaReserva.rotulo traz o texto de cada status", () => {
  assert.equal(StatusDaReserva.rotulo("PENDENTE_PAGAMENTO"), "Aguardando pagamento");
  assert.equal(StatusDaReserva.rotulo("CONFIRMADA"), "Confirmada");
  assert.equal(StatusDaReserva.rotulo("EM_ANDAMENTO"), "Em andamento");
  assert.equal(StatusDaReserva.rotulo("CONCLUIDA"), "Concluída");
  assert.equal(StatusDaReserva.rotulo("CANCELADA"), "Cancelada");
  assert.equal(StatusDaReserva.rotulo("EXPIRADA"), "Expirada");
});

test("as classes da reserva só têm métodos estáticos: não se cria instância", () => {
  for (const Classe of [StatusDaReserva, ContagemDoPrazo]) {
    assert.throws(() => new (Classe as unknown as new () => unknown)(), /só tem métodos estáticos/);
  }
});

test("StatusDaReserva.variante agrupa os status por cor do selo", () => {
  assert.equal(StatusDaReserva.variante("CONFIRMADA"), "confirmada");
  assert.equal(StatusDaReserva.variante("EM_ANDAMENTO"), "confirmada");
  assert.equal(StatusDaReserva.variante("PENDENTE_PAGAMENTO"), "pendente");
  for (const s of ["CONCLUIDA", "CANCELADA", "EXPIRADA"] as const) {
    assert.equal(StatusDaReserva.variante(s), "encerrada", s);
  }
});

test("ContagemDoPrazo.segundosRestantes arredonda para cima (1,5 s ainda mostra 2 s)", () => {
  assert.equal(ContagemDoPrazo.segundosRestantes("2026-11-14T11:00:01.500Z", agora), 2);
  assert.equal(ContagemDoPrazo.segundosRestantes("2026-11-14T11:00:00.001Z", agora), 1);
  assert.equal(ContagemDoPrazo.segundosRestantes("2026-11-14T11:00:00.000Z", agora), 0);
});
