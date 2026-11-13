import { test } from "node:test";
import assert from "node:assert/strict";
import type { StatusReserva } from "../reservas/reserva.ts";
import {
  andamentoDeOutrosDias,
  ITENS_CHECKLIST,
  ROTULO_ITEM,
  dataEmSaoLuis,
  faltaObservacao,
  montarChecklist,
  movimentoPossivel,
  ordenarParaOBalcao,
  type ReservaDoPainel,
} from "./operacao.ts";

test("movimentoPossivel segue a máquina de estados da reserva", () => {
  assert.equal(movimentoPossivel("CONFIRMADA"), "retirada");
  assert.equal(movimentoPossivel("EM_ANDAMENTO"), "devolucao");
  for (const s of ["PENDENTE_PAGAMENTO", "CONCLUIDA", "CANCELADA", "EXPIRADA"] as const) {
    assert.equal(movimentoPossivel(s), null, s);
  }
});

test("montarChecklist manda os 5 itens, desmarcado é não ok, observação vazia some", () => {
  const corpo = montarChecklist({ freios: true, pneus: true }, "   ");
  assert.deepEqual(corpo, {
    checklist: {
      itens: [
        { nome: "freios", ok: true },
        { nome: "pneus", ok: true },
        { nome: "corrente", ok: false },
        { nome: "capacete", ok: false },
        { nome: "luzes", ok: false },
      ],
    },
  });
  assert.equal(montarChecklist({}, " farol fraco ").checklist.observacoes, "farol fraco");
});

test("faltaObservacao só quando há item com problema e nenhuma observação", () => {
  const tudo = { freios: true, pneus: true, corrente: true, capacete: true, luzes: true };
  assert.equal(faltaObservacao(montarChecklist(tudo, "")), false);
  assert.equal(faltaObservacao(montarChecklist({ ...tudo, luzes: false }, "")), true);
  assert.equal(faltaObservacao(montarChecklist({ ...tudo, luzes: false }, "farol")), false);
});

test("dataEmSaoLuis usa o fuso -03:00", () => {
  assert.equal(dataEmSaoLuis(new Date("2026-11-14T02:30:00Z")), "2026-11-13");
  assert.equal(dataEmSaoLuis(new Date("2026-11-14T03:00:00Z")), "2026-11-14");
});

test("ordenarParaOBalcao põe primeiro o que tem ação, depois pelo horário", () => {
  const r = (id: string, status: ReservaDoPainel["status"], inicio: string) =>
    ({ id, status, periodo: { inicio, fim: inicio } }) as ReservaDoPainel;
  const ordem = ordenarParaOBalcao([
    r("a", "CONCLUIDA", "2026-11-14T10:00:00Z"),
    r("b", "EM_ANDAMENTO", "2026-11-14T12:00:00Z"),
    r("c", "CONFIRMADA", "2026-11-14T11:00:00Z"),
  ]).map((x) => x.id);
  assert.deepEqual(ordem, ["c", "b", "a"]);
});

test("ordenarParaOBalcao compara instantes, não texto", () => {
  const r = (id: string, inicio: string) =>
    ({ id, status: "CONFIRMADA", periodo: { inicio, fim: inicio } }) as ReservaDoPainel;
  const ordem = ordenarParaOBalcao([
    r("tarde", "2026-11-14T12:00:00-03:00"),
    r("cedo", "2026-11-14T13:00:00Z"),
  ]).map((x) => x.id);
  assert.deepEqual(ordem, ["cedo", "tarde"]);
});

test("andamentoDeOutrosDias traz só EM_ANDAMENTO que não está na lista do dia", () => {
  const r = (id: string, status: ReservaDoPainel["status"]) =>
    ({ id, status, periodo: { inicio: "2026-11-13T12:00:00Z", fim: "2026-11-14T12:00:00Z" } }) as ReservaDoPainel;
  const doDia = [r("hoje", "EM_ANDAMENTO")];
  const andamento = [r("hoje", "EM_ANDAMENTO"), r("ontem", "EM_ANDAMENTO"), r("estranha", "CONFIRMADA")];
  assert.deepEqual(andamentoDeOutrosDias(doDia, andamento).map((x) => x.id), ["ontem"]);
  assert.deepEqual(andamentoDeOutrosDias([], []), []);
});

test("movimentoPossivel cobre todos os status da reserva (um status novo precisa de decisão aqui)", () => {
  const todos: StatusReserva[] = [
    "PENDENTE_PAGAMENTO",
    "CONFIRMADA",
    "EM_ANDAMENTO",
    "CONCLUIDA",
    "CANCELADA",
    "EXPIRADA",
  ];
  const comAcao = todos.filter((s) => movimentoPossivel(s) !== null);
  assert.deepEqual(comAcao, ["CONFIRMADA", "EM_ANDAMENTO"]);
});

test("ITENS_CHECKLIST tem os 5 itens do contrato, na ordem, cada um com rótulo", () => {
  assert.deepEqual([...ITENS_CHECKLIST], ["freios", "pneus", "corrente", "capacete", "luzes"]);
  for (const item of ITENS_CHECKLIST) assert.ok(ROTULO_ITEM[item], item);
  assert.equal(Object.keys(ROTULO_ITEM).length, ITENS_CHECKLIST.length);
});

test("montarChecklist com tudo em ordem e sem observação não manda o campo observacoes", () => {
  const tudo = { freios: true, pneus: true, corrente: true, capacete: true, luzes: true };
  const corpo = montarChecklist(tudo, "");
  assert.equal("observacoes" in corpo.checklist, false);
  assert.ok(corpo.checklist.itens.every((i) => i.ok));
  assert.equal(corpo.checklist.itens.length, 5);
});

test("montarChecklist só conta como ok o valor true (false e ausente são não ok)", () => {
  const corpo = montarChecklist({ freios: false, pneus: true }, "");
  assert.deepEqual(
    corpo.checklist.itens.map((i) => i.ok),
    [false, true, false, false, false],
  );
});

test("montarChecklist tira espaços e quebras de linha das pontas da observação", () => {
  assert.equal(montarChecklist({}, "\n  pneu murcho \t").checklist.observacoes, "pneu murcho");
  assert.equal("observacoes" in montarChecklist({}, " \n\t ").checklist, false);
});

test("faltaObservacao: tudo desmarcado sem texto exige observação, com texto não", () => {
  assert.equal(faltaObservacao(montarChecklist({}, "")), true);
  assert.equal(faltaObservacao(montarChecklist({}, "bicicleta sem corrente")), false);
});

test("dataEmSaoLuis na virada do dia e do ano", () => {
  assert.equal(dataEmSaoLuis(new Date("2026-12-31T23:59:59-03:00")), "2026-12-31");
  assert.equal(dataEmSaoLuis(new Date("2027-01-01T00:00:00-03:00")), "2027-01-01");
  assert.equal(dataEmSaoLuis(new Date("2027-01-01T02:59:59Z")), "2026-12-31");
});

test("dataEmSaoLuis devolve AAAA-MM-DD com zeros (formato da query data da rota 25)", () => {
  assert.match(dataEmSaoLuis(new Date("2026-03-05T15:00:00Z")), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(dataEmSaoLuis(new Date("2026-03-05T15:00:00Z")), "2026-03-05");
  assert.match(dataEmSaoLuis(), /^\d{4}-\d{2}-\d{2}$/);
});

test("ordenarParaOBalcao não altera a lista original", () => {
  const r = (id: string, status: ReservaDoPainel["status"], inicio: string) =>
    ({ id, status, periodo: { inicio, fim: inicio } }) as ReservaDoPainel;
  const original = [r("a", "CONCLUIDA", "2026-11-14T10:00:00Z"), r("b", "CONFIRMADA", "2026-11-14T09:00:00Z")];
  const copia = [...original];
  ordenarParaOBalcao(original);
  assert.deepEqual(original, copia);
});

test("ordenarParaOBalcao ordena pelo horário dentro de cada grupo e lida com lista vazia", () => {
  const r = (id: string, status: ReservaDoPainel["status"], inicio: string) =>
    ({ id, status, periodo: { inicio, fim: inicio } }) as ReservaDoPainel;
  assert.deepEqual(ordenarParaOBalcao([]), []);
  const ordem = ordenarParaOBalcao([
    r("pend", "PENDENTE_PAGAMENTO", "2026-11-14T08:00:00.000Z"),
    r("canc", "CANCELADA", "2026-11-14T07:00:00.000Z"),
    r("conf2", "CONFIRMADA", "2026-11-14T15:00:00.000Z"),
    r("and", "EM_ANDAMENTO", "2026-11-14T09:00:00.000Z"),
    r("conf1", "CONFIRMADA", "2026-11-14T10:00:00.000Z"),
  ]).map((x) => x.id);
  assert.deepEqual(ordem, ["and", "conf1", "conf2", "canc", "pend"]);
});

test("andamentoDeOutrosDias ordena por horário e não altera as listas recebidas", () => {
  const r = (id: string, inicio: string) =>
    ({ id, status: "EM_ANDAMENTO", periodo: { inicio, fim: inicio } }) as ReservaDoPainel;
  const doDia = [r("hoje", "2026-11-14T12:00:00Z")];
  const andamento = [
    r("anteontem", "2026-11-12T12:00:00Z"),
    r("hoje", "2026-11-14T12:00:00Z"),
    r("ontem", "2026-11-13T12:00:00Z"),
  ];
  const copiaDoDia = [...doDia];
  const copiaAndamento = [...andamento];
  assert.deepEqual(andamentoDeOutrosDias(doDia, andamento).map((x) => x.id), ["anteontem", "ontem"]);
  assert.deepEqual(doDia, copiaDoDia);
  assert.deepEqual(andamento, copiaAndamento);
});

test("andamentoDeOutrosDias devolve vazio quando tudo já está na lista do dia", () => {
  const r = (id: string) =>
    ({ id, status: "EM_ANDAMENTO", periodo: { inicio: "2026-11-14T12:00:00Z", fim: "2026-11-14T13:00:00Z" } }) as ReservaDoPainel;
  assert.deepEqual(andamentoDeOutrosDias([r("a"), r("b")], [r("a"), r("b")]), []);
});
