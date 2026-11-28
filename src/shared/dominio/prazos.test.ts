import assert from "node:assert/strict";
import { test } from "node:test";
import { PrazoDePagamento } from "./prazos.ts";

test("o prazo de pagamento é de 15 minutos, igual ao do banco (expirar_reservas_vencidas)", () => {
  assert.equal(PrazoDePagamento.MS, 15 * 60 * 1000);
});

test("venceEm soma o prazo à criação, sem alterar a data recebida", () => {
  const criada = new Date("2026-11-14T12:00:00.000Z");
  assert.equal(PrazoDePagamento.venceEm(criada).toISOString(), "2026-11-14T12:15:00.000Z");
  assert.equal(criada.toISOString(), "2026-11-14T12:00:00.000Z");
});

test("PrazoDePagamento só tem membros estáticos: criar instância é recusado", () => {
  assert.throws(() => new (PrazoDePagamento as unknown as new () => object)(), /só tem membros estáticos/);
});
