import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calcularExpiraEm,
  ehStatusReserva,
  gerarCodigoReserva,
  PRAZO_PAGAMENTO_MS,
  podeCancelar,
  STATUS_RESERVA,
  validarNovaReserva,
} from "./reserva.ts";

const TIPO = "3f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6f";
// "agora" fixo: 14/11/2026, 08:00 em São Luís
const AGORA = new Date("2026-11-14T11:00:00.000Z");
const CORPO = { tipoId: TIPO, inicio: "2026-11-14T09:00:00-03:00", fim: "2026-11-14T13:00:00-03:00" };

test("o prazo para pagar é de 15 minutos", () => {
  assert.equal(PRAZO_PAGAMENTO_MS, 15 * 60 * 1000);
});

test("expiraEm é a criação + 15 minutos, só para reserva pendente", () => {
  const criada = new Date("2026-11-14T11:00:00.000Z");
  assert.equal(calcularExpiraEm("PENDENTE_PAGAMENTO", criada)?.toISOString(), "2026-11-14T11:15:00.000Z");
  for (const status of STATUS_RESERVA.filter((s) => s !== "PENDENTE_PAGAMENTO")) {
    assert.equal(calcularExpiraEm(status, criada), null, status);
  }
});

test("só pendente e confirmada podem ser canceladas", () => {
  const podem = STATUS_RESERVA.filter(podeCancelar);
  assert.deepEqual([...podem].sort(), ["CONFIRMADA", "PENDENTE_PAGAMENTO"]);
});

test("ehStatusReserva aceita os valores do enum e recusa o resto", () => {
  for (const s of STATUS_RESERVA) assert.equal(ehStatusReserva(s), true);
  for (const v of ["", "pendente_pagamento", "ALUGADA", null, undefined, 3, {}]) {
    assert.equal(ehStatusReserva(v), false, String(v));
  }
});

test("os status do contrato estão todos na lista (e NAO_RETIRADA também, que o banco tem)", () => {
  assert.deepEqual(
    [...STATUS_RESERVA].sort(),
    ["CANCELADA", "CONCLUIDA", "CONFIRMADA", "EM_ANDAMENTO", "EXPIRADA", "NAO_RETIRADA", "PENDENTE_PAGAMENTO"],
  );
});

test("aceita o corpo do contrato e devolve as datas em UTC", () => {
  const r = validarNovaReserva(CORPO, AGORA);
  assert.ok("dados" in r);
  assert.equal(r.dados.tipoId, TIPO);
  assert.equal(r.dados.inicio.toISOString(), "2026-11-14T12:00:00.000Z");
  assert.equal(r.dados.fim.toISOString(), "2026-11-14T16:00:00.000Z");
});

test("campos extras (valor, bicicletaId) são ignorados e não chegam aos dados", () => {
  const r = validarNovaReserva({ ...CORPO, valorAluguelCentavos: 1, bicicletaId: "x", clienteId: "y" }, AGORA);
  assert.ok("dados" in r);
  assert.deepEqual(Object.keys(r.dados).sort(), ["fim", "inicio", "tipoId"]);
});

test("corpo que não é objeto é recusado", () => {
  for (const corpo of [null, undefined, "texto", 42, true, [], [CORPO]]) {
    const r = validarNovaReserva(corpo, AGORA);
    assert.ok("erros" in r, String(corpo));
    assert.ok(r.erros.tipoId && r.erros.inicio && r.erros.fim, "um erro por campo");
  }
});

test("tipoId ausente, de outro tipo ou que não é UUID dá erro no campo tipoId", () => {
  for (const tipoId of [undefined, null, "", 7, "abc", `${TIPO}x`, "3f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6", { a: 1 }]) {
    const r = validarNovaReserva({ ...CORPO, tipoId }, AGORA);
    assert.ok("erros" in r, String(tipoId));
    assert.ok(r.erros.tipoId, String(tipoId));
    assert.equal(r.erros.inicio, undefined);
  }
});

test("aceita UUID em maiúsculas", () => {
  assert.ok("dados" in validarNovaReserva({ ...CORPO, tipoId: TIPO.toUpperCase() }, AGORA));
});

test("período no passado, fim antes do início, menor que 1 h, maior que 7 dias e sem fuso dão 400 por campo", () => {
  const casos: [string, Record<string, unknown>, "inicio" | "fim"][] = [
    ["passado", { inicio: "2026-11-14T07:00:00-03:00", fim: "2026-11-14T13:00:00-03:00" }, "inicio"],
    ["fim antes do início", { inicio: "2026-11-14T13:00:00-03:00", fim: "2026-11-14T09:00:00-03:00" }, "fim"],
    ["menor que 1 hora", { inicio: "2026-11-14T09:00:00-03:00", fim: "2026-11-14T09:59:00-03:00" }, "fim"],
    ["maior que 7 dias", { inicio: "2026-11-14T09:00:00-03:00", fim: "2026-11-21T09:01:00-03:00" }, "fim"],
    ["sem fuso", { inicio: "2026-11-14T09:00:00", fim: "2026-11-14T13:00:00" }, "inicio"],
    ["não é string", { inicio: 1763100000, fim: 1763114400 }, "inicio"],
  ];
  for (const [nome, periodo, campo] of casos) {
    const r = validarNovaReserva({ tipoId: TIPO, ...periodo }, AGORA);
    assert.ok("erros" in r, nome);
    assert.ok(r.erros[campo], nome);
  }
});

test("os limites do período valem: exatamente 1 hora e exatamente 7 dias passam", () => {
  assert.ok("dados" in validarNovaReserva({ tipoId: TIPO, inicio: "2026-11-14T09:00:00-03:00", fim: "2026-11-14T10:00:00-03:00" }, AGORA));
  assert.ok("dados" in validarNovaReserva({ tipoId: TIPO, inicio: "2026-11-14T09:00:00-03:00", fim: "2026-11-21T09:00:00-03:00" }, AGORA));
});

test("vários campos errados voltam todos juntos", () => {
  const r = validarNovaReserva({ tipoId: "x", inicio: "ontem", fim: "amanhã" }, AGORA);
  assert.ok("erros" in r);
  assert.deepEqual(Object.keys(r.erros).sort(), ["fim", "inicio", "tipoId"]);
});

test("o código da reserva tem o formato BIC- + 6 caracteres sem os ambíguos (0, O, 1, I, L)", () => {
  for (let i = 0; i < 200; i++) {
    assert.match(gerarCodigoReserva(), /^BIC-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
  }
});

test("o código praticamente não se repete (menos de 10 repetições em 1000 gerações)", () => {
  const vistos = new Set<string>();
  for (let i = 0; i < 1000; i++) vistos.add(gerarCodigoReserva());
  assert.ok(vistos.size >= 990, `só ${vistos.size} códigos diferentes`);
});

test("sem viés: bytes altos são descartados e todos os 31 caracteres podem sair", () => {
  // 248 = 31 x 8 é o maior múltiplo de 31 abaixo de 256: bytes de 248 a 255 são rejeitados
  const bytes = [255, 248, ...Array.from({ length: 31 }, (_, i) => i), 0, 1, 2, 3, 4];
  let posicao = 0;
  const codigo = gerarCodigoReserva((n) => Uint8Array.from({ length: n }, () => bytes[posicao++ % bytes.length]));
  assert.equal(codigo, "BIC-" + "23456789".slice(0, 6));
});
