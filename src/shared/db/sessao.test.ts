import assert from "node:assert/strict";
import { test } from "node:test";
import { comSessaoEm, VISITANTE } from "./sessao.ts";

const USUARIO = "aaaaaaaa-0000-4000-8000-000000000001";

// Conexão de mentira que anota tudo o que recebe.
function conexaoFalsa(falharEm?: string) {
  const registro: { sql: string; valores?: unknown[] }[] = [];
  let liberada = 0;
  const client = {
    async query(sql: string, valores?: unknown[]) {
      registro.push({ sql, valores });
      if (falharEm && sql.startsWith(falharEm)) throw new Error(`falha em ${falharEm}`);
      return {};
    },
    release() {
      liberada++;
    },
  };
  let conexoes = 0;
  return {
    registro,
    conectar: async () => {
      conexoes++;
      return client;
    },
    get conexoes() {
      return conexoes;
    },
    get liberada() {
      return liberada;
    },
  };
}

test("abre a transação, declara perfil e usuário, executa e confirma", async () => {
  const c = conexaoFalsa();
  const resultado = await comSessaoEm(c.conectar, { perfil: "CLIENTE", usuarioId: USUARIO }, async (cli) => {
    await cli.query("SELECT 1");
    return "feito";
  });
  assert.equal(resultado, "feito");
  const sqls = c.registro.map((r) => r.sql);
  assert.equal(sqls[0], "BEGIN");
  assert.match(sqls[1], /set_config\('app\.perfil', \$1, true\)/);
  assert.match(sqls[1], /set_config\('app\.usuario_id', \$2, true\)/);
  assert.deepEqual(c.registro[1].valores, ["CLIENTE", USUARIO]);
  assert.equal(sqls[2], "SELECT 1");
  assert.equal(sqls[3], "COMMIT");
  assert.equal(c.liberada, 1);
});

test("o perfil e o usuário vão como parâmetros, nunca concatenados no SQL", async () => {
  const c = conexaoFalsa();
  await comSessaoEm(c.conectar, { perfil: "ADMIN", usuarioId: USUARIO }, async () => 1);
  assert.ok(!c.registro[1].sql.includes("ADMIN"));
  assert.ok(!c.registro[1].sql.includes(USUARIO));
  assert.deepEqual(c.registro[1].valores, ["ADMIN", USUARIO]);
});

test("visitante declara perfil e usuário vazios (as funções do banco leem como nulo)", async () => {
  const c = conexaoFalsa();
  await comSessaoEm(c.conectar, VISITANTE, async () => 1);
  assert.deepEqual(c.registro[1].valores, ["", ""]);
  assert.equal(c.liberada, 1);
});

test("se a função falha: ROLLBACK, a conexão é devolvida e o erro sobe", async () => {
  const c = conexaoFalsa();
  await assert.rejects(
    comSessaoEm(c.conectar, { perfil: "CLIENTE", usuarioId: USUARIO }, async () => {
      throw new Error("deu ruim");
    }),
    /deu ruim/,
  );
  const sqls = c.registro.map((r) => r.sql);
  assert.ok(sqls.includes("ROLLBACK"));
  assert.ok(!sqls.includes("COMMIT"));
  assert.equal(c.liberada, 1);
});

test("se o ROLLBACK também falha, o erro original é o que sobe", async () => {
  const c = conexaoFalsa("ROLLBACK");
  await assert.rejects(
    comSessaoEm(c.conectar, { perfil: "CLIENTE", usuarioId: USUARIO }, async () => {
      throw new Error("erro original");
    }),
    /erro original/,
  );
  assert.equal(c.liberada, 1);
});

test("sessão inválida é recusada antes de pegar uma conexão", async () => {
  const invalidas = [
    { perfil: "ROOT", usuarioId: USUARIO },
    // perfis do modelo anterior deixaram de existir (migration 0004)
    { perfil: "GERENTE_LOCADORA", usuarioId: USUARIO },
    { perfil: "ADMIN_PLATAFORMA", usuarioId: USUARIO },
    { perfil: "CLIENTE" },
    { perfil: "CLIENTE", usuarioId: null },
    { perfil: "OPERADOR", usuarioId: "não-é-uuid" },
    { perfil: "ADMIN", usuarioId: "x'; DROP TABLE usuario;--" },
    { perfil: null, usuarioId: USUARIO },
  ];
  for (const sessao of invalidas) {
    const c = conexaoFalsa();
    await assert.rejects(
      // @ts-expect-error: os casos inválidos de propósito não respeitam o tipo
      comSessaoEm(c.conectar, sessao, async () => 1),
      Error,
      JSON.stringify(sessao),
    );
    assert.equal(c.conexoes, 0, `não deveria conectar: ${JSON.stringify(sessao)}`);
  }
});

test("os três perfis do modelo novo são aceitos", async () => {
  for (const perfil of ["CLIENTE", "OPERADOR", "ADMIN"] as const) {
    const c = conexaoFalsa();
    await comSessaoEm(c.conectar, { perfil, usuarioId: USUARIO }, async () => 1);
    assert.deepEqual(c.registro[1].valores, [perfil, USUARIO]);
    assert.equal(c.liberada, 1);
  }
});
