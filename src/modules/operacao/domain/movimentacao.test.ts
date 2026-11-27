import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ConflictError, ValidationError } from "../../../shared/http/errors.ts";
import { Checklist, ItemDoChecklist, MAXIMO_DE_ITENS } from "./checklist.ts";
import { Movimentacao, MovimentacaoInvalida } from "./movimentacao.ts";

const ITENS = [
  { nome: "freios", ok: true },
  { nome: "pneus", ok: true },
  { nome: "luzes", ok: false },
];
const corpo = (extra: Record<string, unknown> = {}) => ({ checklist: { itens: ITENS, observacoes: "farol fraco", ...extra } });
const RESERVA = "11111111-1111-4111-8111-111111111111";
const OPERADOR = "44444444-4444-4444-8444-444444444444";
const AGORA = new Date("2026-11-14T12:00:00.000Z");

describe("Checklist.deCorpo (corpo das rotas 26 e 27)", () => {
  test("aceita o checklist do painel e limpa as observações", () => {
    const c = Checklist.deCorpo(corpo({ observacoes: "  farol fraco  " }));
    assert.deepEqual(c.itensParaPersistir(), ITENS);
    assert.equal(c.observacoes, "farol fraco");
    assert.equal(Checklist.deCorpo(corpo({ observacoes: "   " })).observacoes, null);
    assert.equal(Checklist.deCorpo({ checklist: { itens: ITENS } }).observacoes, null);
    assert.equal(c.temProblema(), true);
  });

  test("recusa corpo sem checklist, lista vazia, item sem nome, ok que não é booleano e item repetido", () => {
    assert.throws(() => Checklist.deCorpo(null), ValidationError);
    assert.throws(() => Checklist.deCorpo({}), ValidationError);
    assert.throws(() => Checklist.deCorpo({ checklist: { itens: [] } }), ValidationError);
    assert.throws(() => Checklist.deCorpo({ checklist: { itens: "freios" } }), ValidationError);
    assert.throws(() => Checklist.deCorpo({ checklist: { itens: [{ nome: "", ok: true }] } }), ValidationError);
    assert.throws(() => Checklist.deCorpo({ checklist: { itens: [{ nome: "   ", ok: true }] } }), ValidationError);
    assert.throws(() => Checklist.deCorpo({ checklist: { itens: [{ nome: "x".repeat(41), ok: true }] } }), ValidationError);
    assert.throws(() => Checklist.deCorpo({ checklist: { itens: [{ nome: "freios", ok: "sim" }] } }), ValidationError);
    assert.throws(
      () => Checklist.deCorpo({ checklist: { itens: [{ nome: "freios", ok: true }, { nome: "Freios", ok: false }] } }),
      (e) => e instanceof ValidationError && "itens[1].nome" in (e.details as object),
    );
    assert.throws(() => Checklist.deCorpo(corpo({ observacoes: 42 })), ValidationError);
    assert.throws(() => Checklist.deCorpo(corpo({ observacoes: "x".repeat(1001) })), ValidationError);
    const muitos = Array.from({ length: MAXIMO_DE_ITENS + 1 }, (_, i) => ({ nome: `item ${i}`, ok: true }));
    assert.throws(() => Checklist.deCorpo({ checklist: { itens: muitos } }), ValidationError);
  });

  test("aceita exatamente os limites: 20 itens, nome de 40 e observações de 1000 caracteres", () => {
    const itens = Array.from({ length: 20 }, (_, i) => ({ nome: `${i}`.padEnd(40, "x"), ok: true }));
    const c = Checklist.deCorpo({ checklist: { itens, observacoes: "o".repeat(1000) } });
    assert.equal(c.itens.length, 20);
    assert.equal(c.observacoes?.length, 1000);
  });

  test("junta todos os problemas, com o campo de cada um", () => {
    assert.throws(
      () => Checklist.deCorpo({ checklist: { itens: [{ nome: "", ok: true }, { nome: "a", ok: 1 }], observacoes: 5 } }),
      (e) => e instanceof ValidationError && ["itens[0].nome", "itens[1].ok", "observacoes"].every((k) => k in (e.details as object)),
    );
  });
});

describe("Checklist e ItemDoChecklist como objetos", () => {
  test("só existem válidos", () => {
    assert.throws(() => new ItemDoChecklist("", true), RangeError);
    assert.throws(() => new Checklist([]), RangeError);
    assert.throws(() => new Checklist([new ItemDoChecklist("freios", true), new ItemDoChecklist("FREIOS", true)]), RangeError);
    assert.throws(() => new Checklist([new ItemDoChecklist("a", true)], "x".repeat(1001)), RangeError);
  });

  test("são encapsulados: nenhum campo visível e a lista devolvida é cópia", () => {
    const c = Checklist.deCorpo(corpo());
    assert.deepEqual(Object.keys(c), []);
    assert.deepEqual(Object.keys(c.itens[0]), []);
    c.itens.pop();
    assert.equal(c.itens.length, 3);
    assert.equal(JSON.stringify(c.itens[0]), '{"nome":"freios","ok":true}');
  });
});

describe("Movimentacao", () => {
  const checklist = Checklist.deCorpo(corpo());

  test("nasce por retirada() ou devolucao() e vai para o banco por paraPersistir()", () => {
    const r = Movimentacao.retirada({ reservaId: RESERVA, operadorId: OPERADOR, checklist, dataHora: AGORA });
    assert.equal(r.tipo, "RETIRADA");
    assert.deepEqual(r.paraPersistir(), {
      reservaId: RESERVA,
      operadorId: OPERADOR,
      tipo: "RETIRADA",
      itens: ITENS,
      observacoes: "farol fraco",
      dataHora: AGORA,
    });
    assert.equal(Movimentacao.devolucao({ reservaId: RESERVA, operadorId: OPERADOR, checklist, dataHora: AGORA }).tipo, "DEVOLUCAO");
  });

  test("não existe sem reserva, sem operador ou com data inválida", () => {
    assert.throws(() => Movimentacao.retirada({ reservaId: "", operadorId: OPERADOR, checklist, dataHora: AGORA }), RangeError);
    assert.throws(() => Movimentacao.retirada({ reservaId: RESERVA, operadorId: "", checklist, dataHora: AGORA }), RangeError);
    assert.throws(() => Movimentacao.retirada({ reservaId: RESERVA, operadorId: OPERADOR, checklist, dataHora: new Date("x") }), RangeError);
  });

  test("é encapsulada e não muda por fora: a data devolvida é cópia", () => {
    const data = new Date(AGORA.getTime());
    const m = Movimentacao.retirada({ reservaId: RESERVA, operadorId: OPERADOR, checklist, dataHora: data });
    data.setFullYear(2000);
    m.dataHora.setFullYear(2001);
    assert.equal(m.dataHora.getTime(), AGORA.getTime());
    assert.deepEqual(Object.keys(m), []);
  });

  test("MovimentacaoInvalida é um 409 (ConflictError)", () => {
    assert.ok(new MovimentacaoInvalida("x") instanceof ConflictError);
  });
});

test("estresse: 10 mil checklists de 20 itens lidos e um corpo hostil grande não travam", () => {
  const itens = Array.from({ length: 20 }, (_, i) => ({ nome: `item ${i}`, ok: i % 2 === 0 }));
  const inicio = performance.now();
  for (let i = 0; i < 10_000; i++) Checklist.deCorpo({ checklist: { itens, observacoes: "ok" } });
  const enorme = { checklist: { itens: Array.from({ length: 100_000 }, () => ({ nome: "a", ok: true })) } };
  assert.throws(() => Checklist.deCorpo(enorme), ValidationError);
  assert.ok(performance.now() - inicio < 3000, "passou de 3 s");
});
