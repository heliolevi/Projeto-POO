import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Bicicleta } from "@/modules/catalogo";
import { Reserva } from "@/modules/reservas";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/http/errors.ts";
import { MovimentacaoInvalida, type MovimentacaoParaPersistir } from "../domain/movimentacao.ts";
import { OperacaoService } from "./operacao-service.ts";
import type { LinhaBicicleta, LinhaReserva, OperacoesOperacao, SessaoEquipe } from "./portas.ts";

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

type Opcoes = { statusDaBicicleta?: LinhaBicicleta["status"]; outraEmAndamento?: string | null; semBicicleta?: boolean };

// Banco em memória com o mínimo que o serviço usa. O corpo chega por um leitor, que conta as
// leituras (o handler só lê depois de conferir o id).
function montar(status: LinhaReserva["status"], agora: Date, opcoes: Opcoes = {}) {
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
  const bicicleta: LinhaBicicleta = {
    id: "b1",
    codigo: "BIC-003",
    tipo: { id: "t1", nome: "Urbana" },
    ponto: { id: "p1", nome: "Ponto Litorânea" },
    numeroSerie: null,
    tamanhoQuadro: null,
    status: opcoes.statusDaBicicleta ?? "DISPONIVEL",
    observacoes: null,
  };
  const movimentacoes: MovimentacaoParaPersistir[] = [];
  const travas: string[] = [];
  const op: OperacoesOperacao = {
    expirarVencidas: async () => {},
    travarReserva: async (id) => {
      travas.push("reserva");
      return id === ID ? { ...linha } : null;
    },
    travarBicicletaDaReserva: async () => {
      travas.push("bicicleta");
      return opcoes.semBicicleta ? null : { ...bicicleta };
    },
    outraReservaEmAndamento: async () => (opcoes.outraEmAndamento ? { codigo: opcoes.outraEmAndamento } : null),
    registrarMovimentacao: async (m) => {
      if (movimentacoes.some((x) => x.tipo === m.tipo)) throw new ConflictError("repetida");
      movimentacoes.push(m);
    },
    mudarStatus: async (id, de, para) => {
      if (id !== ID || linha.status !== de) return false;
      linha.status = para as LinhaReserva["status"];
      return true;
    },
    bicicletaDaReserva: async () => ({ id: bicicleta.id, codigo: bicicleta.codigo }),
  };
  const servico = new OperacaoService({
    transacao: <T>(_s: SessaoEquipe, fn: (o: OperacoesOperacao) => Promise<T>) => fn(op),
    agora: () => agora,
    montarReserva: (l) => new Reserva(l),
    montarBicicleta: (b) => new Bicicleta(b),
  });
  let leituras = 0;
  const leitor = (valor: unknown) => async () => {
    leituras += 1;
    return valor;
  };
  return {
    linha,
    movimentacoes,
    travas,
    leituras: () => leituras,
    retirar: (id: unknown = ID, c: unknown = corpo()) => servico.registrarRetirada(SESSAO, id, leitor(c)),
    devolver: (id: unknown = ID, c: unknown = corpo()) => servico.registrarDevolucao(SESSAO, id, leitor(c)),
  };
}

describe("POST /api/operacao/reservas/{id}/retirada (rota 26)", () => {
  test("confirmada, dentro da janela: grava a retirada e passa para EM_ANDAMENTO com a unidade", async () => {
    const agora = new Date(INICIO.getTime() - 10 * MIN);
    const m = montar("CONFIRMADA", agora);
    const r = await m.retirar();
    assert.equal(r.status, "EM_ANDAMENTO");
    assert.deepEqual(r.bicicleta, { id: "b1", codigo: "BIC-003" });
    assert.equal(r.codigo, "BIC-7K2F9Q");
    assert.equal(r.expiraEm, null);
    assert.equal(m.linha.status, "EM_ANDAMENTO");
    assert.deepEqual(m.movimentacoes, [
      { reservaId: ID, operadorId: OPERADOR, tipo: "RETIRADA", itens: ITENS, observacoes: "farol traseiro fraco", dataHora: agora },
    ]);
    assert.equal(m.leituras(), 1, "o corpo é lido uma vez só");
  });

  test("abre exatamente 30 minutos antes do início", async () => {
    const m = montar("CONFIRMADA", new Date(INICIO.getTime() - 30 * MIN));
    assert.equal((await m.retirar()).status, "EM_ANDAMENTO");
  });

  test("fora da janela de horário é 400 (cedo demais ou depois do fim)", async () => {
    await assert.rejects(() => montar("CONFIRMADA", new Date(INICIO.getTime() - 31 * MIN)).retirar(), ValidationError);
    await assert.rejects(() => montar("CONFIRMADA", FIM).retirar(), ValidationError);
  });

  test("reserva que não está CONFIRMADA é 409 e nada é gravado", async () => {
    for (const status of ["PENDENTE_PAGAMENTO", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA", "EXPIRADA"] as const) {
      const m = montar(status, INICIO);
      await assert.rejects(() => m.retirar(), ConflictError, status);
      assert.equal(m.movimentacoes.length, 0, status);
    }
  });

  test("checklist inválido é 400; id inválido ou desconhecido é 404", async () => {
    const m = montar("CONFIRMADA", INICIO);
    await assert.rejects(() => m.retirar(ID, { checklist: { itens: [] } }), ValidationError);
    await assert.rejects(() => m.retirar("abc"), NotFoundError);
    await assert.rejects(() => m.retirar("22222222-2222-4222-8222-222222222222"), NotFoundError);
    assert.equal(m.linha.status, "CONFIRMADA");
  });

  test("id inválido é 404 sem ler o corpo (corpo quebrado não vira 400)", async () => {
    const m = montar("CONFIRMADA", INICIO);
    await assert.rejects(() => m.retirar("abc", "{"), NotFoundError);
    assert.equal(m.leituras(), 0);
  });

  test("bicicleta em manutenção, bloqueada, fora da frota ou alugada: 409 e nada é gravado", async () => {
    for (const status of ["MANUTENCAO", "BLOQUEADA", "BAIXADA", "ALUGADA"] as const) {
      const m = montar("CONFIRMADA", INICIO, { statusDaBicicleta: status });
      await assert.rejects(() => m.retirar(), (e) => e instanceof MovimentacaoInvalida && /BIC-003/.test(e.message), status);
      assert.equal(m.linha.status, "CONFIRMADA", status);
      assert.equal(m.movimentacoes.length, 0, status);
    }
  });

  test("bicicleta que ainda não voltou da reserva anterior (devolução atrasada): 409 com o código da reserva", async () => {
    const m = montar("CONFIRMADA", INICIO, { outraEmAndamento: "RES-ANTERIOR" });
    await assert.rejects(
      () => m.retirar(),
      (e) => e instanceof MovimentacaoInvalida && e instanceof ConflictError && /RES-ANTERIOR/.test(e.message),
    );
    assert.equal(m.linha.status, "CONFIRMADA");
    assert.equal(m.movimentacoes.length, 0);
  });

  test("reserva sem bicicleta atribuída: 409", async () => {
    await assert.rejects(() => montar("CONFIRMADA", INICIO, { semBicicleta: true }).retirar(), MovimentacaoInvalida);
  });

  test("trava a reserva antes da bicicleta (mesma ordem em todo caminho, sem deadlock)", async () => {
    const m = montar("CONFIRMADA", INICIO);
    await m.retirar();
    assert.deepEqual(m.travas, ["reserva", "bicicleta"]);
  });
});

describe("POST /api/operacao/reservas/{id}/devolucao (rota 27)", () => {
  test("em andamento: grava a devolução e conclui (mesmo depois do fim, com atraso)", async () => {
    const m = montar("EM_ANDAMENTO", new Date(FIM.getTime() + 40 * MIN));
    const r = await m.devolver(ID, corpo({ observacoes: undefined }));
    assert.equal(r.status, "CONCLUIDA");
    assert.equal(m.movimentacoes[0].tipo, "DEVOLUCAO");
    assert.equal(m.movimentacoes[0].observacoes, null);
  });

  test("a devolução não depende do status da bicicleta (ela pode voltar com problema)", async () => {
    const m = montar("EM_ANDAMENTO", FIM, { statusDaBicicleta: "MANUTENCAO" });
    assert.equal((await m.devolver()).status, "CONCLUIDA");
    assert.deepEqual(m.travas, ["reserva"]);
  });

  test("retirada e devolução seguidas levam CONFIRMADA a CONCLUIDA", async () => {
    const m = montar("CONFIRMADA", INICIO);
    await m.retirar();
    const r = await m.devolver();
    assert.equal(r.status, "CONCLUIDA");
    assert.deepEqual(m.movimentacoes.map((x) => x.tipo), ["RETIRADA", "DEVOLUCAO"]);
  });

  test("reserva que não está EM_ANDAMENTO é 409 (devolução repetida inclusive)", async () => {
    for (const status of ["CONFIRMADA", "CONCLUIDA", "CANCELADA"] as const) {
      await assert.rejects(() => montar(status, INICIO).devolver(), ConflictError, status);
    }
  });
});

test("estresse: 2 mil ciclos de retirada e devolução em reservas diferentes", async () => {
  const inicio = performance.now();
  for (let i = 0; i < 2000; i++) {
    const m = montar("CONFIRMADA", INICIO);
    await m.retirar();
    await m.devolver();
    assert.equal(m.linha.status, "CONCLUIDA");
  }
  assert.ok(performance.now() - inicio < 5000, "2 mil ciclos passaram de 5 s");
});
