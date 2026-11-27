import assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictError } from "../../../shared/http/errors.ts";
import type { SessaoEquipe } from "../application/portas.ts";
import { OperacoesNoBanco, RepositorioDeOperacao } from "./repositorio-operacao.ts";

// O SQL das operações sobre um cliente de mentira. A RLS, as travas e a unique de verdade estão nos
// testes de banco (db/tests/blackbox/operacao_api); aqui se prova o que este código MANDA.
type Consulta = { sql: string; valores?: unknown[] };
type Resposta = { rows?: unknown[]; rowCount?: number } | Error;
const ID = "11111111-1111-4111-8111-111111111111";

function cliente(respostas: (sql: string) => Resposta = () => ({ rows: [], rowCount: 0 })) {
  const consultas: Consulta[] = [];
  return {
    consultas,
    client: {
      async query(sql: string, valores?: unknown[]) {
        consultas.push({ sql: sql.replace(/\s+/g, " ").trim(), valores });
        const r = respostas(sql);
        if (r instanceof Error) throw r;
        return { rows: r.rows ?? [], rowCount: r.rowCount ?? r.rows?.length ?? 0 };
      },
    } as never,
  };
}

const VIEW = {
  id: ID,
  codigo: "BIC-1",
  status: "CONFIRMADA",
  tipo_id: "t",
  tipo_nome: "Urbana",
  ponto_id: "p",
  ponto_nome: "Ponto",
  ponto_endereco: "Rua",
  inicio: new Date("2026-11-14T12:00:00Z"),
  fim: new Date("2026-11-14T16:00:00Z"),
  valor_aluguel_centavos: 4000,
  valor_caucao_centavos: 15000,
  criado_em: new Date("2026-11-13T12:00:00Z"),
  pagamento_status: "APROVADO",
  pagamento_metodo: "PIX",
};

test("expirarVencidas chama a função do banco", async () => {
  const c = cliente();
  await new OperacoesNoBanco(c.client).expirarVencidas();
  assert.deepEqual(c.consultas.map((q) => q.sql), ["SELECT expirar_reservas_vencidas()"]);
});

test("travarReserva: trava a linha ANTES de ler a view e converte para o formato da classe", async () => {
  const c = cliente((sql) => (/FOR UPDATE/.test(sql) ? { rowCount: 1 } : { rows: [VIEW] }));
  const linha = await new OperacoesNoBanco(c.client).travarReserva(ID);
  assert.match(c.consultas[0].sql, /FROM reserva WHERE id = \$1 FOR UPDATE/);
  assert.match(c.consultas[1].sql, /FROM reserva_detalhada WHERE id = \$1/);
  assert.deepEqual(c.consultas.map((q) => q.valores), [[ID], [ID]]);
  assert.equal(linha?.tipoNome, "Urbana");
  assert.equal(linha?.valorCaucaoCentavos, 15000);
  assert.equal(linha?.valorAluguelCentavos, 4000);
  assert.equal(linha?.pagamentoMetodo, "PIX");
  assert.equal(linha?.pontoEndereco, "Rua");
});

test("travarReserva: reserva que não existe é null e a view nem é consultada", async () => {
  const c = cliente(() => ({ rowCount: 0 }));
  assert.equal(await new OperacoesNoBanco(c.client).travarReserva(ID), null);
  assert.equal(c.consultas.length, 1);
});

test("travarBicicletaDaReserva: trava só a bicicleta (FOR UPDATE OF b) e monta o formato do catálogo", async () => {
  const c = cliente(() => ({
    rows: [
      {
        id: "b1",
        codigo: "BIC-3",
        numero_serie: "N1",
        tamanho_quadro: "M",
        status: "DISPONIVEL",
        observacoes: null,
        tipo_id: "t",
        tipo_nome: "Urbana",
        ponto_id: "p",
        ponto_nome: "Ponto",
      },
    ],
  }));
  const b = await new OperacoesNoBanco(c.client).travarBicicletaDaReserva(ID);
  assert.match(c.consultas[0].sql, /FOR UPDATE OF b$/);
  assert.deepEqual(c.consultas[0].valores, [ID]);
  assert.deepEqual(b, {
    id: "b1",
    codigo: "BIC-3",
    tipo: { id: "t", nome: "Urbana" },
    ponto: { id: "p", nome: "Ponto" },
    numeroSerie: "N1",
    tamanhoQuadro: "M",
    status: "DISPONIVEL",
    observacoes: null,
  });
  assert.equal(await new OperacoesNoBanco(cliente().client).travarBicicletaDaReserva(ID), null);
});

test("outraReservaEmAndamento: parâmetros na ordem (bicicleta, reserva), devolve a primeira ou null", async () => {
  const c = cliente(() => ({ rows: [{ codigo: "RES-A" }] }));
  assert.deepEqual(await new OperacoesNoBanco(c.client).outraReservaEmAndamento("b1", ID), { codigo: "RES-A" });
  assert.deepEqual(c.consultas[0].valores, ["b1", ID]);
  assert.match(c.consultas[0].sql, /status = 'EM_ANDAMENTO'/);
  assert.equal(await new OperacoesNoBanco(cliente().client).outraReservaEmAndamento("b1", ID), null);
});

const MOV = {
  reservaId: ID,
  operadorId: "op",
  tipo: "RETIRADA" as const,
  itens: [{ nome: "freios", ok: true }],
  observacoes: "obs",
  dataHora: new Date("2026-11-14T12:00:00Z"),
};

test("registrarMovimentacao: SAVEPOINT, INSERT parametrizado e RELEASE, nesta ordem", async () => {
  const c = cliente();
  await new OperacoesNoBanco(c.client).registrarMovimentacao(MOV);
  assert.deepEqual(c.consultas.map((q) => q.sql.split(" ")[0]), ["SAVEPOINT", "INSERT", "RELEASE"]);
  assert.deepEqual(c.consultas[1].valores, [ID, "op", "RETIRADA", JSON.stringify(MOV.itens), "obs", MOV.dataHora]);
  assert.ok(!c.consultas[1].sql.includes("freios"), "o checklist vai por parâmetro, nunca no texto SQL");
});

test("registrarMovimentacao: unique repetida desfaz só o INSERT e vira 409 com a mensagem de cada tipo", async () => {
  const repetida = Object.assign(new Error("dup"), { code: "23505", constraint: "movimentacao_reserva_tipo_unico" });
  const casos = [
    ["RETIRADA", "A retirada desta reserva já foi registrada."],
    ["DEVOLUCAO", "A devolução desta reserva já foi registrada."],
  ] as const;
  for (const [tipo, texto] of casos) {
    const c = cliente((sql) => (/^\s*INSERT/.test(sql) ? repetida : { rows: [] }));
    await assert.rejects(
      () => new OperacoesNoBanco(c.client).registrarMovimentacao({ ...MOV, tipo }),
      (e) => e instanceof ConflictError && e.message === texto,
    );
    assert.deepEqual(c.consultas.map((q) => q.sql.split(" ")[0]), ["SAVEPOINT", "INSERT", "ROLLBACK"]);
  }
});

test("registrarMovimentacao: outro erro (mesmo 23505 de outra constraint) sobe como está, sem virar 409", async () => {
  const outros = [
    Object.assign(new Error("outra"), { code: "23505", constraint: "outra_unica" }),
    Object.assign(new Error("fk"), { code: "23503", constraint: "movimentacao_reserva_tipo_unico" }),
    new Error("queda"),
  ];
  for (const erro of outros) {
    const c = cliente((sql) => (/^\s*INSERT/.test(sql) ? erro : { rows: [] }));
    await assert.rejects(() => new OperacoesNoBanco(c.client).registrarMovimentacao(MOV), (e) => e === erro);
    assert.ok(!c.consultas.some((q) => q.sql.startsWith("ROLLBACK")));
  }
});

test("mudarStatus: só muda se estava no status esperado (true com 1 linha, false sem nenhuma)", async () => {
  const c = cliente(() => ({ rowCount: 1 }));
  assert.equal(await new OperacoesNoBanco(c.client).mudarStatus(ID, "CONFIRMADA", "EM_ANDAMENTO"), true);
  assert.deepEqual(c.consultas[0].valores, [ID, "CONFIRMADA", "EM_ANDAMENTO"]);
  assert.match(c.consultas[0].sql, /WHERE id = \$1 AND status = \$2/);
  assert.equal(await new OperacoesNoBanco(cliente(() => ({ rowCount: 0 })).client).mudarStatus(ID, "a", "b"), false);
});

test("bicicletaDaReserva devolve id e código, ou null", async () => {
  const c = cliente(() => ({ rows: [{ id: "b1", codigo: "BIC-3" }] }));
  assert.deepEqual(await new OperacoesNoBanco(c.client).bicicletaDaReserva(ID), { id: "b1", codigo: "BIC-3" });
  assert.equal(await new OperacoesNoBanco(cliente().client).bicicletaDaReserva(ID), null);
});

test("RepositorioDeOperacao.emTransacao: abre a transação com a sessão da equipe e entrega as operações do cliente", async () => {
  const sessao: SessaoEquipe = { perfil: "OPERADOR", usuarioId: "cccccccc-0000-4000-8000-000000000003" };
  const c = cliente();
  const recebidas: unknown[] = [];
  const repositorio = new RepositorioDeOperacao({
    comSessao: async (s: unknown, fn: (client: never) => Promise<unknown>) => {
      recebidas.push(s);
      return fn(c.client);
    },
  } as never);
  const resultado = await repositorio.emTransacao(sessao, async (op) => {
    await op.expirarVencidas();
    return "ok";
  });
  assert.equal(resultado, "ok");
  assert.deepEqual(recebidas, [sessao]);
  assert.equal(c.consultas.length, 1);
});

test("o erro da transação sobe sem ser engolido", async () => {
  const falha = new Error("queda");
  const repositorio = new RepositorioDeOperacao({
    comSessao: async () => {
      throw falha;
    },
  } as never);
  await assert.rejects(() => repositorio.emTransacao({ perfil: "ADMIN", usuarioId: ID }, async () => 1), (e) => e === falha);
});

test("encapsulamento: nenhum campo visível", () => {
  assert.deepEqual(Object.keys(new OperacoesNoBanco(cliente().client)), []);
  assert.deepEqual(Object.keys(new RepositorioDeOperacao({} as never)), []);
  assert.deepEqual(Object.keys(RepositorioDeOperacao.padrao), []);
});
