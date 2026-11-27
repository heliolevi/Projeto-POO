import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Pool } from "pg";
import { BancoDeDados } from "./banco-de-dados.ts";

const USUARIO = "aaaaaaaa-0000-4000-8000-000000000001";

// Pool de mentira que anota o que recebe.
function poolFalso() {
  const registro: { sql: string; valores?: unknown[] }[] = [];
  let conexoes = 0;
  let liberadas = 0;
  const client = {
    async query(sql: string, valores?: unknown[]) {
      registro.push({ sql, valores });
      return { rows: [{ ok: true }] };
    },
    release() {
      liberadas++;
    },
  };
  const pool = {
    async query(sql: string, valores?: unknown[]) {
      registro.push({ sql, valores });
      return { rows: [{ de: "pool" }] };
    },
    async connect() {
      conexoes++;
      return client;
    },
  };
  return { pool: pool as unknown as Pool, registro, get conexoes() { return conexoes; }, get liberadas() { return liberadas; } };
}

test("o pool só é criado no primeiro uso (o build e os testes não precisam de banco)", async () => {
  let criados = 0;
  const falso = poolFalso();
  const banco = new BancoDeDados(() => {
    criados++;
    return falso.pool;
  });
  assert.equal(criados, 0);
  await banco.consultar("SELECT 1");
  await banco.consultar("SELECT 2");
  assert.equal(criados, 1, "uma criação só, reaproveitada");
});

test("consultar repassa o SQL e os parâmetros ao pool e devolve as linhas", async () => {
  const falso = poolFalso();
  const banco = new BancoDeDados(() => falso.pool);
  const { rows } = await banco.consultar("SELECT * FROM x WHERE id = $1", ["a"]);
  assert.deepEqual(rows, [{ de: "pool" }]);
  assert.deepEqual(falso.registro[0], { sql: "SELECT * FROM x WHERE id = $1", valores: ["a"] });
});

test("comSessao abre a transação com a sessão, executa e devolve a conexão ao pool", async () => {
  const falso = poolFalso();
  const banco = new BancoDeDados(() => falso.pool);
  const resultado = await banco.comSessao({ perfil: "CLIENTE", usuarioId: USUARIO }, async (c) => {
    await c.query("SELECT 1");
    return "feito";
  });
  assert.equal(resultado, "feito");
  assert.deepEqual(falso.registro.map((r) => r.sql).filter((s) => ["BEGIN", "COMMIT", "SELECT 1"].includes(s)), ["BEGIN", "SELECT 1", "COMMIT"]);
  assert.equal(falso.conexoes, 1);
  assert.equal(falso.liberadas, 1);
});

test("comSessao com sessão inválida nem chega a pedir conexão", async () => {
  const falso = poolFalso();
  const banco = new BancoDeDados(() => falso.pool);
  // @ts-expect-error: caso inválido de propósito
  await assert.rejects(banco.comSessao({ perfil: "ROOT", usuarioId: USUARIO }, async () => 1), Error);
  assert.equal(falso.conexoes, 0);
});

test("duas instâncias não dividem o pool", async () => {
  const a = poolFalso();
  const b = poolFalso();
  await new BancoDeDados(() => a.pool).consultar("SELECT 1");
  await new BancoDeDados(() => b.pool).consultar("SELECT 2");
  assert.equal(a.registro.length, 1);
  assert.equal(b.registro.length, 1);
});

test("o banco padrão existe e é o mesmo objeto sempre, sem abrir conexão ao ser importado", () => {
  assert.ok(BancoDeDados.padrao instanceof BancoDeDados);
  assert.equal(BancoDeDados.padrao, BancoDeDados.padrao);
});

test("BancoDeDados é encapsulado: nenhum campo visível", () => {
  assert.deepEqual(Object.keys(new BancoDeDados(() => poolFalso().pool)), []);
});

test("o pacote pg só é importado como tipo: a carga da classe não exige o pg instalado (o job de banco da CI não o tem na raiz)", () => {
  const fonte = readFileSync(new URL("./banco-de-dados.ts", import.meta.url), "utf8");
  assert.ok(!/^import\s+(?!type\b)[^;]*from\s+["']pg["']/m.test(fonte), "import estático de valor do pg");
  assert.match(fonte, /await import\("pg"\)/);
});

test("se a criação do pool falha, a falha não fica guardada: a próxima consulta tenta de novo", async () => {
  const falso = poolFalso();
  let tentativas = 0;
  const banco = new BancoDeDados(() => {
    tentativas++;
    if (tentativas === 1) throw new Error("Variável de ambiente ausente: DATABASE_URL");
    return falso.pool;
  });
  await assert.rejects(banco.consultar("SELECT 1"), /DATABASE_URL/);
  await banco.consultar("SELECT 1");
  assert.equal(tentativas, 2);
});

test("a fábrica pode ser assíncrona, e consultas simultâneas criam um pool só", async () => {
  const falso = poolFalso();
  let criados = 0;
  const banco = new BancoDeDados(async () => {
    criados++;
    await new Promise((r) => setTimeout(r, 10));
    return falso.pool;
  });
  await Promise.all(Array.from({ length: 30 }, () => banco.consultar("SELECT 1")));
  assert.equal(criados, 1);
});
