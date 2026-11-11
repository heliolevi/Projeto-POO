import assert from "node:assert/strict";
import { test } from "node:test";
import { formatarContagem, podeCancelar, segundosRestantes } from "./reserva.ts";

const agora = new Date("2026-11-14T11:00:00.000Z");

test("segundosRestantes conta até o prazo e nunca fica negativo", () => {
  assert.equal(segundosRestantes("2026-11-14T11:15:00.000Z", agora), 900);
  assert.equal(segundosRestantes("2026-11-14T10:59:00.000Z", agora), 0);
  assert.equal(segundosRestantes(null, agora), 0);
  assert.equal(segundosRestantes("data-invalida", agora), 0);
});

test("formatarContagem mostra mm:ss", () => {
  assert.equal(formatarContagem(900), "15:00");
  assert.equal(formatarContagem(65), "01:05");
  assert.equal(formatarContagem(0), "00:00");
});

test("só reservas pendentes ou confirmadas podem ser canceladas", () => {
  assert.equal(podeCancelar("PENDENTE_PAGAMENTO"), true);
  assert.equal(podeCancelar("CONFIRMADA"), true);
  for (const s of ["EM_ANDAMENTO", "CONCLUIDA", "CANCELADA", "EXPIRADA"] as const) {
    assert.equal(podeCancelar(s), false);
  }
});
