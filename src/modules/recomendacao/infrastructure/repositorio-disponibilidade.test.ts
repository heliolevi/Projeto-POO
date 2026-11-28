import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessaoCliente } from "../application/portas.ts";
import { RepositorioDeDisponibilidade } from "./repositorio-disponibilidade.ts";

// O SQL da disponibilidade sobre um banco de mentira. A RLS e as funções SECURITY DEFINER reais estão nos
// testes de banco (disponibilidade_por_tipo); aqui se prova o que este código MANDA: a sessão declarada,
// a expiração das vencidas ANTES de contar, datas por parâmetro e a conversão das linhas.
const CLIENTE: SessaoCliente = { perfil: "CLIENTE", usuarioId: "bbbbbbbb-0000-4000-8000-000000000002" };
const INICIO = new Date("2026-11-14T12:00:00.000Z");
const FIM = new Date("2026-11-14T16:00:00.000Z");

const LINHA = {
  id: "t1", nome: "Urbana", descricao: "Cidade", atividades: ["URBANO", "PASSEIO"], altura_min_cm: 150, altura_max_cm: 195,
  nivel_recomendado: "INICIANTE", preco_hora_centavos: 1000, preco_dia_centavos: 5000, valor_caucao_centavos: 15000, ativo: true, unidades_livres: 3,
};

function banco(linhas: Record<string, unknown>[] = [LINHA], falha?: Error) {
  const consultas: { sql: string; valores?: unknown[] }[] = [];
  const sessoes: unknown[] = [];
  return {
    consultas,
    sessoes,
    repositorio: new RepositorioDeDisponibilidade({
      comSessao: async (sessao: unknown, fn: (client: never) => Promise<unknown>) => {
        sessoes.push(sessao);
        return fn({
          async query(sql: string, valores?: unknown[]) {
            consultas.push({ sql, valores });
            if (falha && /unidades_livres_por_tipo/.test(sql)) throw falha;
            return { rows: /unidades_livres_por_tipo/.test(sql) ? linhas : [] };
          },
        } as never);
      },
    } as never),
  };
}

test("roda dentro da sessão do cliente (a RLS depende dela)", async () => {
  const b = banco();
  await b.repositorio.tiposComUnidadesLivres(CLIENTE, INICIO, FIM);
  assert.equal(b.sessoes[0], CLIENTE);
});

test("expira as pendentes vencidas ANTES de contar as unidades livres (senão a vencida ainda seguraria a bicicleta)", async () => {
  const b = banco();
  await b.repositorio.tiposComUnidadesLivres(CLIENTE, INICIO, FIM);
  assert.equal(b.consultas.length, 2);
  assert.equal(b.consultas[0].sql, "SELECT expirar_reservas_vencidas()");
  assert.match(b.consultas[1].sql, /unidades_livres_por_tipo/);
});

test("as datas vão como parâmetros (ISO), nunca dentro do texto SQL", async () => {
  const b = banco();
  await b.repositorio.tiposComUnidadesLivres(CLIENTE, INICIO, FIM);
  assert.deepEqual(b.consultas[1].valores, ["2026-11-14T12:00:00.000Z", "2026-11-14T16:00:00.000Z"]);
  assert.ok(!b.consultas[1].sql.includes("2026-11-14"));
});

test("só conta ponto ativo e tipo ativo, e só devolve tipo com unidade livre, em ordem de nome", async () => {
  const b = banco();
  await b.repositorio.tiposComUnidadesLivres(CLIENTE, INICIO, FIM);
  const sql = b.consultas[1].sql;
  assert.match(sql, /WHERE p\.ativo\s+AND t\.ativo/);
  assert.match(sql, /x\.unidades_livres > 0/);
  assert.match(sql, /ORDER BY x\.nome/);
});

test("converte a linha do banco (snake_case) para o tipo candidato, com a contagem de unidades livres", async () => {
  const [t] = await banco().repositorio.tiposComUnidadesLivres(CLIENTE, INICIO, FIM);
  assert.deepEqual(t, {
    id: "t1", nome: "Urbana", descricao: "Cidade", atividades: ["URBANO", "PASSEIO"], alturaMinCm: 150, alturaMaxCm: 195,
    nivelRecomendado: "INICIANTE", precoHoraCentavos: 1000, precoDiaCentavos: 5000, valorCaucaoCentavos: 15000, ativo: true, unidadesLivres: 3,
  });
});

test("nada livre é lista vazia, não erro", async () => {
  assert.deepEqual(await banco([]).repositorio.tiposComUnidadesLivres(CLIENTE, INICIO, FIM), []);
});

test("erro do banco sobe (a busca não vira lista vazia)", async () => {
  await assert.rejects(banco([], new Error("banco fora do ar")).repositorio.tiposComUnidadesLivres(CLIENTE, INICIO, FIM), /banco fora do ar/);
});

test("não lê reserva nem bicicleta direto: só as funções do banco (uma consulta direta daria 'livre' para o que é de outro cliente)", async () => {
  const b = banco();
  await b.repositorio.tiposComUnidadesLivres(CLIENTE, INICIO, FIM);
  for (const c of b.consultas) assert.ok(!/FROM\s+(reserva|bicicleta)\b/i.test(c.sql), c.sql.slice(0, 60));
});

test("o repositório do app existe, o banco é injetável e nenhum campo é visível", () => {
  assert.ok(RepositorioDeDisponibilidade.padrao instanceof RepositorioDeDisponibilidade);
  assert.deepEqual(Object.keys(banco().repositorio), []);
});
