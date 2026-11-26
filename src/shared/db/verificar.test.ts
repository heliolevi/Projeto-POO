import assert from "node:assert/strict";
import { test } from "node:test";
import { VerificadorDoBanco } from "./verificar.ts";

// Banco de mentira: devolve a linha do SELECT inicial e a contagem de migrations.
function banco(linha: Record<string, unknown>, total = 11) {
  const sqls: string[] = [];
  return {
    sqls,
    async consultar(sql: string) {
      sqls.push(sql);
      return { rows: sql.includes("count(*)") ? [{ total }] : [linha] };
    },
  };
}

test("devolve o banco, a versão do PostGIS e quantas migrations rodaram", async () => {
  const b = banco({ banco: "neondb", postgis: "3.4.0", controle: "schema_migrations" }, 11);
  assert.deepEqual(await new VerificadorDoBanco(b).verificar(), { banco: "neondb", postgis: "3.4.0", migrations: 11 });
  assert.equal(b.sqls.length, 2);
});

test("sem PostGIS, postgis vem null", async () => {
  const r = await new VerificadorDoBanco(banco({ banco: "x", postgis: null, controle: "schema_migrations" })).verificar();
  assert.equal(r.postgis, null);
});

test("sem a tabela de controle, migrations vem null e não faz a segunda consulta", async () => {
  const b = banco({ banco: "x", postgis: null, controle: null });
  const r = await new VerificadorDoBanco(b).verificar();
  assert.equal(r.migrations, null);
  assert.equal(b.sqls.length, 1);
});

test("erro do banco sobe para quem chamou (a rota responde 503)", async () => {
  const quebrado = {
    async consultar(): Promise<{ rows: Record<string, unknown>[] }> {
      throw new Error("banco fora do ar");
    },
  };
  await assert.rejects(new VerificadorDoBanco(quebrado).verificar(), /banco fora do ar/);
});
