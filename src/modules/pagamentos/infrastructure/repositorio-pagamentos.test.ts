import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { VISITANTE } from "../../../shared/db/sessao.ts";
import { Dinheiro } from "../../../shared/dominio/dinheiro.ts";
import { FabricaDePagamento, PagamentoCartao, PagamentoPix } from "../domain/formas-de-pagamento.ts";
import { OperacoesDePagamentoNoBanco, RepositorioDePagamentosNoBanco } from "./repositorio-pagamentos.ts";

// O SQL sobre um banco de mentira. A RLS e as funções SECURITY DEFINER reais estão em
// db/tests/blackbox/pagamentos_api.test.mjs; aqui se prova o que este código MANDA ao banco.
const CRIADO = new Date("2026-11-14T11:00:00.000Z");
const PAGO = new Date("2026-11-14T11:05:00.000Z");
const COPIA = "00020126-teste";

const LINHA = {
  id: "pg-1",
  reserva_id: "r-1",
  metodo: "PIX",
  valor_centavos: 4800,
  status: "PENDENTE",
  mp_payment_id: "pi_1",
  pix_expira_em: new Date("2026-11-14T11:15:00.000Z"),
  qr_code_pix: COPIA,
  pago_em: null,
  criado_em: CRIADO,
};

type Consulta = { sql: string; valores?: unknown[] };

function cliente(respostas: (sql: string) => Record<string, unknown>[] = () => [], rowCount = 1) {
  const consultas: Consulta[] = [];
  return {
    consultas,
    client: {
      async query(sql: string, valores?: unknown[]) {
        consultas.push({ sql, valores });
        return { rows: respostas(sql), rowCount };
      },
    },
  };
}

const operacoes = (respostas?: (sql: string) => Record<string, unknown>[], rowCount?: number) => {
  const c = cliente(respostas, rowCount);
  return { ...c, op: new OperacoesDePagamentoNoBanco(c.client as never) };
};

describe("OperacoesDePagamentoNoBanco: leituras", () => {
  test("a linha do banco vira o Pix certo, com prazo, código e id da cobrança", async () => {
    const { op } = operacoes(() => [LINHA]);
    const p = await op.buscarPorId("pg-1");
    assert.ok(p instanceof PagamentoPix);
    assert.equal(p.id, "pg-1");
    assert.equal(p.reservaId, "r-1");
    assert.equal(p.valor.centavos, 4800);
    assert.equal(p.status, "PENDENTE");
    assert.equal(p.mpPaymentId, "pi_1");
    assert.equal(p.copiaECola, COPIA);
    assert.equal(p.expiraEm().toISOString(), "2026-11-14T11:15:00.000Z");
    assert.equal(p.criadoEm.toISOString(), CRIADO.toISOString());
  });

  test("linha de cartão vira PagamentoCartao; linha aprovada leva a data do pagamento", async () => {
    const cartao = await operacoes(() => [{ ...LINHA, metodo: "CARTAO_DEBITO", pix_expira_em: null, qr_code_pix: null }]).op.buscarPorId("pg-1");
    assert.ok(cartao instanceof PagamentoCartao);
    assert.equal(cartao.metodo, "CARTAO_DEBITO");
    const aprovado = await operacoes(() => [{ ...LINHA, status: "APROVADO", pago_em: PAGO }]).op.buscarPorId("pg-1");
    assert.equal(aprovado?.pagoEm?.toISOString(), PAGO.toISOString());
  });

  test("sem linha é null, em todas as buscas", async () => {
    const { op } = operacoes(() => []);
    assert.equal(await op.buscarPorId("x"), null);
    assert.equal(await op.buscarPorIdExterno("x"), null);
    assert.equal(await op.travarPorIdExterno("x"), null);
    assert.equal(await op.buscarPendenteDaReserva("x"), null);
    assert.equal(await op.travarReserva("x"), null);
    assert.equal(await op.situacao("x"), null);
    assert.equal(await op.pagador(), null);
  });

  test("toda busca de pagamento filtra pelo cliente da sessão no próprio SQL (a RLS não basta para o dono do banco)", async () => {
    const { op, consultas } = operacoes(() => []);
    await op.buscarPorId("a");
    await op.buscarPorIdExterno("b");
    await op.travarPorIdExterno("c");
    await op.buscarPendenteDaReserva("d");
    assert.equal(consultas.length, 4);
    for (const c of consultas) assert.match(c.sql, /cliente_id = sessao_usuario_id\(\)/, c.sql.slice(0, 80));
  });

  test("só a busca 'travar' usa FOR UPDATE; a outra, por id externo, é sem trava", async () => {
    const { op, consultas } = operacoes(() => []);
    await op.buscarPorIdExterno("pi_1");
    await op.travarPorIdExterno("pi_1");
    assert.ok(!/FOR UPDATE/.test(consultas[0].sql));
    assert.match(consultas[1].sql, /FOR UPDATE\s*$/);
  });

  test("o pendente da reserva é só o PENDENTE, o mais recente", async () => {
    const { op, consultas } = operacoes(() => []);
    await op.buscarPendenteDaReserva("r-1");
    assert.match(consultas[0].sql, /status = 'PENDENTE'/);
    assert.match(consultas[0].sql, /ORDER BY criado_em DESC LIMIT 1/);
    assert.deepEqual(consultas[0].valores, ["r-1"]);
  });

  test("os valores vão por parâmetro, nunca dentro do texto do SQL", async () => {
    const { op, consultas } = operacoes(() => []);
    const perigoso = "x'; DROP TABLE pagamento; --";
    await op.buscarPorId(perigoso);
    await op.buscarPorIdExterno(perigoso);
    await op.travarPorIdExterno(perigoso);
    await op.buscarPendenteDaReserva(perigoso);
    await op.travarReserva(perigoso);
    await op.situacao(perigoso);
    await op.confirmarReserva(perigoso);
    for (const c of consultas) {
      assert.ok(!c.sql.includes("DROP"), c.sql.slice(0, 60));
      assert.deepEqual(c.valores?.[0], perigoso);
    }
  });
});

describe("OperacoesDePagamentoNoBanco: reserva", () => {
  test("travarReserva trava a linha do cliente (FOR UPDATE) e calcula o prazo de 15 minutos só se pendente", async () => {
    const pendente = operacoes(() => [{ id: "r-1", status: "PENDENTE_PAGAMENTO", valor_aluguel_centavos: 4800, criado_em: CRIADO }]);
    const r = await pendente.op.travarReserva("r-1");
    assert.match(pendente.consultas[0].sql, /cliente_id = sessao_usuario_id\(\) FOR UPDATE/);
    assert.deepEqual(r, { id: "r-1", status: "PENDENTE_PAGAMENTO", valorAluguelCentavos: 4800, expiraEm: new Date("2026-11-14T11:15:00.000Z") });

    const confirmada = await operacoes(() => [{ id: "r-1", status: "CONFIRMADA", valor_aluguel_centavos: 4800, criado_em: CRIADO }]).op.travarReserva("r-1");
    assert.equal(confirmada?.expiraEm, null);
  });

  test("situacao lê reserva_detalhada e devolve status da reserva e do pagamento", async () => {
    const { op, consultas } = operacoes(() => [{ status: "CONFIRMADA", pagamento_status: "APROVADO" }]);
    assert.deepEqual(await op.situacao("r-1"), { statusReserva: "CONFIRMADA", statusPagamento: "APROVADO" });
    assert.match(consultas[0].sql, /FROM reserva_detalhada/);
    const sem = await operacoes(() => [{ status: "PENDENTE_PAGAMENTO", pagamento_status: null }]).op.situacao("r-1");
    assert.deepEqual(sem, { statusReserva: "PENDENTE_PAGAMENTO", statusPagamento: null });
  });

  test("confirmarReserva só confirma pendente do cliente e dentro do prazo (15 min em ms por parâmetro)", async () => {
    const um = operacoes(() => [], 1);
    assert.equal(await um.op.confirmarReserva("r-1"), true);
    assert.match(um.consultas[0].sql, /status = 'PENDENTE_PAGAMENTO'/);
    assert.match(um.consultas[0].sql, /cliente_id = sessao_usuario_id\(\)/);
    assert.match(um.consultas[0].sql, /criado_em > now\(\)/);
    assert.deepEqual(um.consultas[0].valores, ["r-1", 15 * 60 * 1000]);
    assert.equal(await operacoes(() => [], 0).op.confirmarReserva("r-1"), false, "nenhuma linha: não confirmou");
    assert.equal(await operacoes(() => [], 2).op.confirmarReserva("r-1"), false, "só exatamente uma linha conta");
  });

  test("expirarVencidas chama a função do banco; pagador lê nome e e-mail do cliente da sessão", async () => {
    const { op, consultas } = operacoes((sql) => (/FROM usuario/.test(sql) ? [{ nome: "Maria", email: "m@x.test" }] : []));
    await op.expirarVencidas();
    assert.equal(consultas[0].sql, "SELECT expirar_reservas_vencidas()");
    assert.deepEqual(await op.pagador(), { nome: "Maria", email: "m@x.test" });
    assert.match(consultas[1].sql, /WHERE id = sessao_usuario_id\(\)/);
  });
});

describe("OperacoesDePagamentoNoBanco.salvar", () => {
  const pix = (extra: Record<string, unknown> = {}) =>
    new PagamentoPix({
      id: "pg-1", reservaId: "r-1", valor: Dinheiro.deCentavos(4800), criadoEm: CRIADO,
      expiraEm: new Date("2026-11-14T11:15:00.000Z"), mpPaymentId: "pi_1", copiaECola: COPIA, ...extra,
    });

  test("grava o Pix pendente com id, valor, prazo e copia e cola, tudo por parâmetro", async () => {
    const { op, consultas } = operacoes();
    await op.salvar(pix());
    assert.match(consultas[0].sql, /INSERT INTO pagamento/);
    assert.match(consultas[0].sql, /ON CONFLICT \(id\) DO UPDATE/);
    assert.deepEqual(consultas[0].valores, [
      "pg-1", "r-1", "PIX", 4800, "PENDENTE", "pi_1", "2026-11-14T11:15:00.000Z", null, CRIADO.toISOString(), COPIA,
    ]);
  });

  test("o upsert só atualiza status, id da cobrança e data do pagamento (valor e reserva nunca mudam)", async () => {
    const { op, consultas } = operacoes();
    await op.salvar(pix());
    const atualiza = consultas[0].sql.slice(consultas[0].sql.indexOf("DO UPDATE"));
    assert.match(atualiza, /status = EXCLUDED\.status/);
    assert.match(atualiza, /mp_payment_id = EXCLUDED\.mp_payment_id/);
    assert.match(atualiza, /pago_em = EXCLUDED\.pago_em/);
    assert.ok(!/valor_centavos|reserva_id/.test(atualiza));
  });

  test("aprovado grava pago_em; estornado volta a gravar pago_em nulo (o banco exige)", async () => {
    const a = operacoes();
    const aprovado = pix();
    aprovado.confirmar("pi_1", PAGO);
    await a.op.salvar(aprovado);
    assert.equal(a.consultas[0].valores?.[4], "APROVADO");
    assert.equal(a.consultas[0].valores?.[7], PAGO.toISOString());

    const b = operacoes();
    aprovado.estornarTudo();
    await b.op.salvar(aprovado);
    assert.equal(b.consultas[0].valores?.[4], "ESTORNADO");
    assert.equal(b.consultas[0].valores?.[7], null);
  });

  test("cartão grava sem prazo nem copia e cola", async () => {
    const { op, consultas } = operacoes();
    await op.salvar(FabricaDePagamento.criar("CARTAO_CREDITO", { id: "pg-2", reservaId: "r-2", valor: Dinheiro.deCentavos(1000), criadoEm: CRIADO }));
    assert.deepEqual(consultas[0].valores, ["pg-2", "r-2", "CARTAO_CREDITO", 1000, "PENDENTE", null, null, null, CRIADO.toISOString(), null]);
  });

  test("erro do banco sobe (nada é engolido)", async () => {
    const op = new OperacoesDePagamentoNoBanco({ query: async () => { throw new Error("banco fora do ar"); } } as never);
    await assert.rejects(op.salvar(pix()), /banco fora do ar/);
    await assert.rejects(op.buscarPorId("x"), /banco fora do ar/);
  });
});

describe("RepositorioDePagamentosNoBanco", () => {
  function banco() {
    const sessoes: unknown[] = [];
    const c = cliente((sql) => (/cliente_do_pagamento/.test(sql) ? [{ cliente_id: "cli-1" }] : []));
    return {
      ...c,
      sessoes,
      repositorio: new RepositorioDePagamentosNoBanco({
        comSessao: async (sessao: unknown, fn: (client: never) => Promise<unknown>) => {
          sessoes.push(sessao);
          return fn(c.client as never);
        },
      } as never),
    };
  }

  test("emTransacao roda dentro da sessão do cliente e entrega as operações no mesmo client", async () => {
    const b = banco();
    const sessao = { perfil: "CLIENTE" as const, usuarioId: "cli-1" };
    const r = await b.repositorio.emTransacao(sessao, async (op) => {
      await op.expirarVencidas();
      return "feito";
    });
    assert.equal(r, "feito");
    assert.equal(b.sessoes[0], sessao);
    assert.equal(b.consultas[0].sql, "SELECT expirar_reservas_vencidas()");
  });

  test("o erro de dentro da transação sobe", async () => {
    const b = banco();
    await assert.rejects(b.repositorio.emTransacao({ perfil: "CLIENTE", usuarioId: "u" }, async () => { throw new Error("falhou"); }), /falhou/);
  });

  test("clienteDoPagamento roda como VISITANTE (o aviso chega sem sessão), pela função SECURITY DEFINER", async () => {
    const b = banco();
    assert.equal(await b.repositorio.clienteDoPagamento("pi_1"), "cli-1");
    assert.equal(b.sessoes[0], VISITANTE);
    assert.match(b.consultas[0].sql, /cliente_do_pagamento\(\$1\)/);
    assert.deepEqual(b.consultas[0].valores, ["pi_1"]);
  });

  test("cobrança sem dono é null", async () => {
    const c = cliente(() => []);
    const r = new RepositorioDePagamentosNoBanco({ comSessao: async (_s: unknown, fn: (c: never) => Promise<unknown>) => fn(c.client as never) } as never);
    assert.equal(await r.clienteDoPagamento("pi_x"), null);
  });

  test("nenhum campo é visível e o do app existe", () => {
    assert.deepEqual(Object.keys(banco().repositorio), []);
    assert.deepEqual(Object.keys(operacoes().op), []);
    assert.ok(RepositorioDePagamentosNoBanco.padrao instanceof RepositorioDePagamentosNoBanco);
  });
});
