import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Reserva } from "@/modules/reservas";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/http/errors.ts";
import type { LinhaReserva, NovaMovimentacao, OperacoesOperacao, SessaoEquipe } from "./portas.ts";
import { criarRegistrarDevolucao, criarRegistrarRetirada, validarChecklist } from "./registrar-movimentacao.ts";

const MIN = 60_000;
const ID = "11111111-1111-4111-8111-111111111111";
const OPERADOR = "44444444-4444-4444-8444-444444444444";
const SESSAO: SessaoEquipe = { perfil: "OPERADOR", usuarioId: OPERADOR };
const INICIO = new Date("2026-11-14T12:00:00.000Z");
const FIM = new Date("2026-11-14T16:00:00.000Z");

const ITENS = [
  { nome: "freios", ok: true },
  { nome: "pneus", ok: true },
  { nome: "corrente", ok: true },
  { nome: "capacete", ok: true },
  { nome: "luzes", ok: false },
];
const corpo = (extra: Record<string, unknown> = {}) => ({
  checklist: { itens: ITENS, observacoes: "farol traseiro fraco", ...extra },
});

function montar(status: LinhaReserva["status"], agora: Date) {
  const linha: LinhaReserva = {
    id: ID,
    codigo: "BIC-7K2F9Q",
    status,
    tipoId: "t1",
    tipoNome: "Urbana",
    pontoId: "p1",
    pontoNome: "Ponto Litorânea",
    pontoEndereco: "Av. Litorânea, 100",
    inicio: INICIO,
    fim: FIM,
    valorAluguelCentavos: 4000,
    valorCaucaoCentavos: 15000,
    criadoEm: new Date(INICIO.getTime() - 24 * 60 * MIN),
    pagamentoStatus: "APROVADO",
    pagamentoMetodo: "PIX",
  };
  const movimentacoes: NovaMovimentacao[] = [];
  const op: OperacoesOperacao = {
    expirarVencidas: async () => {},
    travarReserva: async (id) => (id === ID ? { ...linha } : null),
    registrarMovimentacao: async (m) => {
      if (movimentacoes.some((x) => x.tipo === m.tipo)) throw new ConflictError("repetida");
      movimentacoes.push(m);
    },
    mudarStatus: async (id, de, para) => {
      if (id !== ID || linha.status !== de) return false;
      linha.status = para as LinhaReserva["status"];
      return true;
    },
    bicicletaDaReserva: async () => ({ id: "b1", codigo: "BIC-003" }),
  };
  const deps = { transacao: <T>(_s: SessaoEquipe, fn: (o: OperacoesOperacao) => Promise<T>) => fn(op), agora: () => agora, montarReserva: (l: LinhaReserva) => new Reserva(l) };
  return { linha, movimentacoes, retirar: criarRegistrarRetirada(deps), devolver: criarRegistrarDevolucao(deps) };
}

describe("validarChecklist", () => {
  test("aceita o checklist do painel e limpa as observações", () => {
    assert.deepEqual(validarChecklist(corpo({ observacoes: "  farol fraco  " })), {
      itens: ITENS,
      observacoes: "farol fraco",
    });
    assert.equal(validarChecklist(corpo({ observacoes: "   " })).observacoes, null);
    assert.equal(validarChecklist({ checklist: { itens: ITENS } }).observacoes, null);
  });

  test("recusa corpo sem checklist, lista vazia, item sem nome, ok que não é booleano e item repetido", () => {
    assert.throws(() => validarChecklist(null), ValidationError);
    assert.throws(() => validarChecklist({}), ValidationError);
    assert.throws(() => validarChecklist({ checklist: { itens: [] } }), ValidationError);
    assert.throws(() => validarChecklist({ checklist: { itens: [{ nome: "", ok: true }] } }), ValidationError);
    assert.throws(() => validarChecklist({ checklist: { itens: [{ nome: "freios", ok: "sim" }] } }), ValidationError);
    assert.throws(
      () => validarChecklist({ checklist: { itens: [{ nome: "freios", ok: true }, { nome: "Freios", ok: false }] } }),
      (e) => e instanceof ValidationError && "itens[1].nome" in (e.details as object),
    );
    assert.throws(() => validarChecklist(corpo({ observacoes: 42 })), ValidationError);
    assert.throws(() => validarChecklist(corpo({ observacoes: "x".repeat(1001) })), ValidationError);
    const muitos = Array.from({ length: 21 }, (_, i) => ({ nome: `item ${i}`, ok: true }));
    assert.throws(() => validarChecklist({ checklist: { itens: muitos } }), ValidationError);
  });
});

describe("POST /api/operacao/reservas/{id}/retirada (rota 26)", () => {
  test("confirmada, dentro da janela: grava a retirada e passa para EM_ANDAMENTO com a unidade", async () => {
    const m = montar("CONFIRMADA", new Date(INICIO.getTime() - 10 * MIN));
    const r = await m.retirar(SESSAO, ID, corpo());
    assert.equal(r.status, "EM_ANDAMENTO");
    assert.deepEqual(r.bicicleta, { id: "b1", codigo: "BIC-003" });
    assert.equal(r.codigo, "BIC-7K2F9Q");
    assert.equal(r.expiraEm, null);
    assert.equal(m.linha.status, "EM_ANDAMENTO");
    assert.equal(m.movimentacoes.length, 1);
    assert.deepEqual(m.movimentacoes[0], {
      reservaId: ID,
      operadorId: OPERADOR,
      tipo: "RETIRADA",
      itens: ITENS,
      observacoes: "farol traseiro fraco",
    });
  });

  test("abre exatamente 30 minutos antes do início", async () => {
    const m = montar("CONFIRMADA", new Date(INICIO.getTime() - 30 * MIN));
    assert.equal((await m.retirar(SESSAO, ID, corpo())).status, "EM_ANDAMENTO");
  });

  test("fora da janela de horário é 400 (cedo demais ou depois do fim)", async () => {
    await assert.rejects(
      () => montar("CONFIRMADA", new Date(INICIO.getTime() - 31 * MIN)).retirar(SESSAO, ID, corpo()),
      ValidationError,
    );
    await assert.rejects(() => montar("CONFIRMADA", FIM).retirar(SESSAO, ID, corpo()), ValidationError);
  });

  test("reserva que não está CONFIRMADA é 409 e nada é gravado", async () => {
    for (const status of ["PENDENTE_PAGAMENTO", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA", "EXPIRADA"] as const) {
      const m = montar(status, INICIO);
      await assert.rejects(() => m.retirar(SESSAO, ID, corpo()), ConflictError, status);
      assert.equal(m.movimentacoes.length, 0, status);
    }
  });

  test("checklist inválido é 400 antes de tocar no banco; id inválido ou desconhecido é 404", async () => {
    const m = montar("CONFIRMADA", INICIO);
    await assert.rejects(() => m.retirar(SESSAO, ID, { checklist: { itens: [] } }), ValidationError);
    await assert.rejects(() => m.retirar(SESSAO, "abc", corpo()), NotFoundError);
    await assert.rejects(() => m.retirar(SESSAO, "22222222-2222-4222-8222-222222222222", corpo()), NotFoundError);
    assert.equal(m.linha.status, "CONFIRMADA");
  });
});

describe("POST /api/operacao/reservas/{id}/devolucao (rota 27)", () => {
  test("em andamento: grava a devolução e conclui (mesmo depois do fim, com atraso)", async () => {
    const m = montar("EM_ANDAMENTO", new Date(FIM.getTime() + 40 * MIN));
    const r = await m.devolver(SESSAO, ID, corpo({ observacoes: undefined }));
    assert.equal(r.status, "CONCLUIDA");
    assert.equal(m.movimentacoes[0].tipo, "DEVOLUCAO");
    assert.equal(m.movimentacoes[0].observacoes, null);
  });

  test("retirada e devolução seguidas levam CONFIRMADA a CONCLUIDA", async () => {
    const m = montar("CONFIRMADA", INICIO);
    await m.retirar(SESSAO, ID, corpo());
    const r = await m.devolver(SESSAO, ID, corpo());
    assert.equal(r.status, "CONCLUIDA");
    assert.deepEqual(m.movimentacoes.map((x) => x.tipo), ["RETIRADA", "DEVOLUCAO"]);
  });

  test("reserva que não está EM_ANDAMENTO é 409 (devolução repetida inclusive)", async () => {
    for (const status of ["CONFIRMADA", "CONCLUIDA", "CANCELADA"] as const) {
      await assert.rejects(() => montar(status, INICIO).devolver(SESSAO, ID, corpo()), ConflictError, status);
    }
  });
});
