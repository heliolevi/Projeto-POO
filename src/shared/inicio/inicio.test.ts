import { test } from "node:test";
import assert from "node:assert/strict";
import type { Reserva, StatusReserva } from "../reservas/reserva.ts";
import { primeiroNome, proximaReserva, saudacao } from "./inicio.ts";

const AGORA = new Date("2026-11-14T15:00:00Z");

function reserva(id: string, status: StatusReserva, inicio: string, fim: string): Reserva {
  return { id, status, periodo: { inicio, fim } } as Reserva;
}

test("proximaReserva prefere a que está em andamento", () => {
  const lista = [
    reserva("a", "CONFIRMADA", "2026-11-14T16:00:00Z", "2026-11-14T18:00:00Z"),
    reserva("b", "EM_ANDAMENTO", "2026-11-14T13:00:00Z", "2026-11-14T17:00:00Z"),
  ];
  assert.equal(proximaReserva(lista, AGORA)?.id, "b");
});

test("proximaReserva escolhe a mais próxima que ainda não terminou", () => {
  const lista = [
    reserva("tarde", "CONFIRMADA", "2026-11-16T12:00:00Z", "2026-11-16T14:00:00Z"),
    reserva("cedo", "PENDENTE_PAGAMENTO", "2026-11-15T12:00:00Z", "2026-11-15T14:00:00Z"),
  ];
  assert.equal(proximaReserva(lista, AGORA)?.id, "cedo");
});

test("proximaReserva ignora reservas encerradas, canceladas, expiradas e já terminadas", () => {
  const lista = [
    reserva("c", "CONCLUIDA", "2026-11-20T12:00:00Z", "2026-11-20T14:00:00Z"),
    reserva("x", "CANCELADA", "2026-11-20T12:00:00Z", "2026-11-20T14:00:00Z"),
    reserva("e", "EXPIRADA", "2026-11-20T12:00:00Z", "2026-11-20T14:00:00Z"),
    reserva("velha", "CONFIRMADA", "2026-11-13T12:00:00Z", "2026-11-13T14:00:00Z"),
  ];
  assert.equal(proximaReserva(lista, AGORA), null);
  assert.equal(proximaReserva([], AGORA), null);
});

test("proximaReserva não altera a lista recebida", () => {
  const lista = [
    reserva("b", "CONFIRMADA", "2026-11-16T12:00:00Z", "2026-11-16T14:00:00Z"),
    reserva("a", "CONFIRMADA", "2026-11-15T12:00:00Z", "2026-11-15T14:00:00Z"),
  ];
  const copia = [...lista];
  proximaReserva(lista, AGORA);
  assert.deepEqual(lista, copia);
});

test("primeiroNome pega só a primeira palavra e aguenta espaços e nome vazio", () => {
  assert.equal(primeiroNome("Maria da Silva"), "Maria");
  assert.equal(primeiroNome("  João   Pedro "), "João");
  assert.equal(primeiroNome("Ana"), "Ana");
  assert.equal(primeiroNome(""), "");
  assert.equal(primeiroNome("   "), "");
});

test("saudacao usa a hora de São Luís (UTC-3)", () => {
  assert.equal(saudacao(new Date("2026-11-14T08:00:00Z")), "Bom dia"); // 05:00
  assert.equal(saudacao(new Date("2026-11-14T14:59:00Z")), "Bom dia"); // 11:59
  assert.equal(saudacao(new Date("2026-11-14T15:00:00Z")), "Boa tarde"); // 12:00
  assert.equal(saudacao(new Date("2026-11-14T20:59:00Z")), "Boa tarde"); // 17:59
  assert.equal(saudacao(new Date("2026-11-14T21:00:00Z")), "Boa noite"); // 18:00
  assert.equal(saudacao(new Date("2026-11-14T06:00:00Z")), "Boa noite"); // 03:00
  assert.equal(saudacao(new Date("2026-11-14T02:59:00Z")), "Boa noite"); // 23:59 do dia 13
});
