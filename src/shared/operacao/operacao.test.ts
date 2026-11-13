import { test } from "node:test";
import assert from "node:assert/strict";
import {
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
