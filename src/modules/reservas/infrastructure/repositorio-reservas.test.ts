import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { STATUS_RESERVA, TRANSICOES, podeCancelar } from "../domain/reserva.ts";
import { operacoesNoBanco } from "./repositorio-reservas.ts";

// Testes do repositório com um cliente falso que só grava as consultas. Não substituem os testes de
// banco (db/tests, que rodam num PostgreSQL), mas protegem na CI comum o que mais importa no SQL do
// cancelamento: a ordem das consultas e de onde vem a lista de status.
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
  return { chamadas, operacoes: operacoesNoBanco(client as never) };
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

describe("repositório de reservas: travarReserva", () => {
  test("trava a linha (FOR UPDATE) ANTES de ler a view, nesta ordem", async () => {
    const { chamadas, operacoes } = clienteFalso([{ rows: [{ "?column?": 1 }], rowCount: 1 }, { rows: [LINHA_DA_VIEW] }]);
    const linha = await operacoes.travarReserva(LINHA_DA_VIEW.id);
    assert.equal(chamadas.length, 2);
    assert.match(chamadas[0].sql, /FROM reserva WHERE id = \$1 FOR UPDATE/);
    assert.match(chamadas[1].sql, /FROM reserva_detalhada WHERE id = \$1/);
    assert.ok(!/FOR UPDATE/.test(chamadas[1].sql), "a view junta várias tabelas e não se trava");
    assert.deepEqual(chamadas[0].valores, [LINHA_DA_VIEW.id]);
    assert.equal(linha?.codigo, "BIC-AAAAAA");
    assert.equal(linha?.tipoNome, "Urbana");
  });

  test("reserva que não existe (ou não é do cliente) devolve null sem nem ler a view", async () => {
    const { chamadas, operacoes } = clienteFalso([{ rows: [], rowCount: 0 }]);
    assert.equal(await operacoes.travarReserva("22222222-2222-4222-8222-222222222222"), null);
    assert.equal(chamadas.length, 1);
    assert.match(chamadas[0].sql, /FOR UPDATE/);
  });

  test("a linha lida é a de depois da trava (a leitura vem depois, não antes)", async () => {
    const { chamadas, operacoes } = clienteFalso([{ rows: [{}], rowCount: 1 }, { rows: [{ ...LINHA_DA_VIEW, status: "CANCELADA" }] }]);
    const linha = await operacoes.travarReserva(LINHA_DA_VIEW.id);
    assert.equal(linha?.status, "CANCELADA");
    const ordem = chamadas.map((c) => (/FOR UPDATE/.test(c.sql) ? "trava" : "leitura"));
    assert.deepEqual(ordem, ["trava", "leitura"]);
  });
});

describe("repositório de reservas: marcarCancelada", () => {
  test("os status que o SQL aceita vêm da tabela TRANSICOES, e não de uma lista escrita no SQL", async () => {
    const { chamadas, operacoes } = clienteFalso();
    await operacoes.marcarCancelada("id-1");
    assert.equal(chamadas.length, 1);
    assert.match(chamadas[0].sql, /status = ANY\(\$2::status_reserva\[\]\)/);
    assert.ok(!/IN \(/.test(chamadas[0].sql), "nenhuma lista de status escrita à mão no SQL");
    assert.deepEqual(chamadas[0].valores[1], STATUS_RESERVA.filter((s) => TRANSICOES[s].includes("CANCELADA")));
    assert.deepEqual(chamadas[0].valores[1], ["PENDENTE_PAGAMENTO", "CONFIRMADA"]);
    assert.deepEqual(chamadas[0].valores[1], STATUS_RESERVA.filter(podeCancelar));
  });

  test("grava cancelada_em com a hora do banco (a constraint exige a data junto com o status)", async () => {
    const { chamadas, operacoes } = clienteFalso();
    await operacoes.marcarCancelada("id-1");
    assert.match(chamadas[0].sql, /SET status = 'CANCELADA', cancelada_em = now\(\)/);
    assert.equal(chamadas[0].valores[0], "id-1");
  });
});
