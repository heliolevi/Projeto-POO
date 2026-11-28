import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CodigoRepetido, SobreposicaoDePeriodo } from "../domain/erros.ts";
import { OperacoesDeReservasNoBanco, RepositorioDeReservas } from "./repositorio-reservas.ts";

// Cliente falso que só grava as consultas e devolve as respostas combinadas. A prova com o PostgreSQL
// de verdade está em db/tests/blackbox/reservas_api.test.mjs.
type Chamada = { sql: string; valores: unknown[] };

function clienteFalso(respostas: Array<{ rows?: unknown[]; rowCount?: number }> = []) {
  const chamadas: Chamada[] = [];
  const client = {
    query: async (sql: string, valores: unknown[] = []) => {
      chamadas.push({ sql: sql.replace(/\s+/g, " ").trim(), valores });
      const resposta = respostas.shift() ?? { rows: [], rowCount: 0 };
      return { rows: resposta.rows ?? [], rowCount: resposta.rowCount ?? (resposta.rows ?? []).length };
    },
  };
  return { chamadas, operacoes: new OperacoesDeReservasNoBanco(client as never) };
}

const LINHA_DA_VIEW = {
  id: "11111111-1111-4111-8111-111111111111",
  codigo: "BIC-AAAAAA",
  status: "PENDENTE_PAGAMENTO",
  tipo_id: "t",
  tipo_nome: "Urbana",
  ponto_id: "p",
  ponto_nome: "Ponto",
  ponto_endereco: "Av.",
  inicio: new Date("2026-11-14T12:00:00Z"),
  fim: new Date("2026-11-14T16:00:00Z"),
  valor_aluguel_centavos: 4000,
  valor_caucao_centavos: 15000,
  criado_em: new Date("2026-11-14T11:00:00Z"),
  pagamento_status: null,
  pagamento_metodo: null,
};

describe("OperacoesDeReservasNoBanco: o resto das operações", () => {
  test("encapsulamento: a instância não expõe campos", () => {
    assert.deepEqual(Object.keys(clienteFalso().operacoes), []);
  });

  test("expirarVencidas chama a função do banco, sem parâmetros", async () => {
    const { chamadas, operacoes } = clienteFalso();
    await operacoes.expirarVencidas();
    assert.deepEqual(chamadas, [{ sql: "SELECT expirar_reservas_vencidas()", valores: [] }]);
  });

  test("buscarTipo lê só tipo ativo, com o id como parâmetro, e converte as colunas", async () => {
    const { chamadas, operacoes } = clienteFalso([
      {
        rows: [{ id: "t1", nome: "Urbana", preco_hora_centavos: 1000, preco_dia_centavos: 5000, valor_caucao_centavos: 15000 }],
      },
    ]);
    const tipo = await operacoes.buscarTipo("t1");
    assert.deepEqual(tipo, { id: "t1", nome: "Urbana", precoHoraCentavos: 1000, precoDiaCentavos: 5000, valorCaucaoCentavos: 15000 });
    assert.match(chamadas[0].sql, /FROM tipo_bicicleta WHERE id = \$1 AND ativo/);
    assert.deepEqual(chamadas[0].valores, ["t1"]);
  });

  test("buscarTipo devolve null quando não há tipo ativo", async () => {
    assert.equal(await clienteFalso().operacoes.buscarTipo("t1"), null);
  });

  test("escolherUnidade manda tipo, datas ISO e as já tentadas como parâmetros", async () => {
    const { chamadas, operacoes } = clienteFalso([{ rows: [{ bicicleta_id: "b1", ponto_id: "p1" }] }]);
    const inicio = new Date("2026-11-14T12:00:00Z");
    const fim = new Date("2026-11-14T16:00:00Z");
    assert.deepEqual(await operacoes.escolherUnidade("t1", inicio, fim, ["b0"]), { bicicletaId: "b1", pontoId: "p1" });
    assert.match(chamadas[0].sql, /escolher_unidade_para_reserva\(\$1::uuid, \$2::timestamptz, \$3::timestamptz, \$4::uuid\[\]\)/);
    assert.deepEqual(chamadas[0].valores, ["t1", "2026-11-14T12:00:00.000Z", "2026-11-14T16:00:00.000Z", ["b0"]]);
    assert.equal(await clienteFalso().operacoes.escolherUnidade("t1", inicio, fim, []), null);
  });

  test("listar manda o status como parâmetro (nunca no SQL) e ordena da mais recente para a mais antiga", async () => {
    const { chamadas, operacoes } = clienteFalso([{ rows: [LINHA_DA_VIEW] }]);
    const linhas = await operacoes.listar("CONFIRMADA");
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].criadoEm.toISOString(), "2026-11-14T11:00:00.000Z");
    assert.match(chamadas[0].sql, /FROM reserva_detalhada/);
    assert.match(chamadas[0].sql, /ORDER BY criado_em DESC, id/);
    assert.deepEqual(chamadas[0].valores, ["CONFIRMADA"]);
    assert.ok(!chamadas[0].sql.includes("CONFIRMADA"));
    await operacoes.listar(null);
    assert.deepEqual(chamadas[1].valores, [null]);
  });

  test("buscar lê pela view com o id como parâmetro e devolve null se não existe", async () => {
    const { chamadas, operacoes } = clienteFalso([{ rows: [LINHA_DA_VIEW] }, { rows: [] }]);
    assert.equal((await operacoes.buscar(LINHA_DA_VIEW.id))?.codigo, "BIC-AAAAAA");
    assert.equal(await operacoes.buscar("x"), null);
    assert.match(chamadas[0].sql, /FROM reserva_detalhada WHERE id = \$1/);
  });
});

describe("OperacoesDeReservasNoBanco: inserir", () => {
  const NOVA = {
    codigo: "BIC-AAAAAA",
    clienteId: "c1",
    bicicletaId: "b1",
    pontoId: "p1",
    inicio: new Date("2026-11-14T12:00:00Z"),
    fim: new Date("2026-11-14T16:00:00Z"),
    valorAluguelCentavos: 4000,
    valorCaucaoCentavos: 15000,
  };

  test("caminho feliz: SAVEPOINT, INSERT parametrizado, RELEASE e leitura pela view, nesta ordem", async () => {
    const { chamadas, operacoes } = clienteFalso([{}, { rows: [{ id: LINHA_DA_VIEW.id }] }, {}, { rows: [LINHA_DA_VIEW] }]);
    const linha = await operacoes.inserir(NOVA);
    assert.equal(linha.id, LINHA_DA_VIEW.id);
    assert.deepEqual(chamadas.map((c) => c.sql.split(" ")[0]), ["SAVEPOINT", "INSERT", "RELEASE", "SELECT"]);
    assert.deepEqual(chamadas[1].valores, [
      "BIC-AAAAAA", "c1", "b1", "p1", "2026-11-14T12:00:00.000Z", "2026-11-14T16:00:00.000Z", 4000, 15000,
    ]);
    assert.match(chamadas[1].sql, /'PENDENTE_PAGAMENTO'/);
  });

  function clienteQueFalhaNoInsert(erro: unknown) {
    const chamadas: string[] = [];
    const client = {
      query: async (sql: string) => {
        chamadas.push(sql.replace(/\s+/g, " ").trim());
        if (sql.includes("INSERT INTO reserva")) throw erro;
        return { rows: [], rowCount: 0 };
      },
    };
    return { chamadas, operacoes: new OperacoesDeReservasNoBanco(client as never) };
  }

  test("23P01 desfaz só a tentativa (ROLLBACK TO SAVEPOINT) e vira SobreposicaoDePeriodo", async () => {
    const { chamadas, operacoes } = clienteQueFalhaNoInsert({ code: "23P01" });
    await assert.rejects(operacoes.inserir(NOVA), SobreposicaoDePeriodo);
    assert.equal(chamadas.at(-1), "ROLLBACK TO SAVEPOINT tentativa_reserva");
  });

  test("23505 em reserva_codigo_unico desfaz a tentativa e vira CodigoRepetido", async () => {
    const { chamadas, operacoes } = clienteQueFalhaNoInsert({ code: "23505", constraint: "reserva_codigo_unico" });
    await assert.rejects(operacoes.inserir(NOVA), CodigoRepetido);
    assert.equal(chamadas.at(-1), "ROLLBACK TO SAVEPOINT tentativa_reserva");
  });

  test("23505 de outra constraint sobe como está, sem ROLLBACK TO SAVEPOINT", async () => {
    const erro = { code: "23505", constraint: "outra" };
    const { chamadas, operacoes } = clienteQueFalhaNoInsert(erro);
    await assert.rejects(operacoes.inserir(NOVA), (e) => e === erro);
    assert.ok(!chamadas.some((c) => c.startsWith("ROLLBACK")));
  });

  test("erro sem código (queda de conexão) sobe como está", async () => {
    const erro = new Error("conexão caiu");
    const { operacoes } = clienteQueFalhaNoInsert(erro);
    await assert.rejects(operacoes.inserir(NOVA), (e) => e === erro);
  });

  test("a reserva gravada que a leitura não enxerga é erro (nunca devolve nada)", async () => {
    const { operacoes } = clienteFalso([{}, { rows: [{ id: "x" }] }, {}, { rows: [] }]);
    await assert.rejects(operacoes.inserir(NOVA), /não apareceu na leitura/);
  });
});

describe("RepositorioDeReservas", () => {
  test("executar abre a transação com a sessão do cliente e entrega as operações do banco", async () => {
    const sessoes: unknown[] = [];
    const client = { query: async () => ({ rows: [], rowCount: 0 }) };
    const repositorio = new RepositorioDeReservas({
      comSessao: async (sessao, fn) => {
        sessoes.push(sessao);
        return fn(client as never);
      },
    });
    const sessao = { perfil: "CLIENTE" as const, usuarioId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
    const resultado = await repositorio.executar(sessao, async (op) => {
      assert.ok(op instanceof OperacoesDeReservasNoBanco);
      return 42;
    });
    assert.equal(resultado, 42);
    assert.deepEqual(sessoes, [sessao]);
  });

  test("o erro do caso de uso sobe pelo banco (para o ROLLBACK)", async () => {
    const boom = new Error("falhou");
    const repositorio = new RepositorioDeReservas({ comSessao: (_s, fn) => fn({} as never) });
    await assert.rejects(
      repositorio.executar({ perfil: "CLIENTE", usuarioId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, async () => {
        throw boom;
      }),
      (e) => e === boom,
    );
  });

  test("encapsulamento e instância do app", () => {
    assert.deepEqual(Object.keys(RepositorioDeReservas.padrao), []);
    assert.ok(RepositorioDeReservas.padrao instanceof RepositorioDeReservas);
  });
});
