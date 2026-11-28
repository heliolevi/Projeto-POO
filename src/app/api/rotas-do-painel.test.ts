import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";

// Teste de fumaça da rota 25: carrega o route.ts de verdade, que chama o painel-handlers.ts, que
// liga o exigirSessao REAL do módulo contas ao PainelDeReservas e ao BancoDeDados. Só o banco é de
// mentira (um pool que responde "qual é o perfil deste usuário?" e devolve uma reserva). Se alguém
// trocar o handler, esquecer a guarda ou deixar de declarar a sessão no banco, a CI pega.
//
// A lógica fina (cada caso de 401, 403, 400 e os filtros) está em controlador-do-painel.test.ts.

const SEGREDO = "segredo-de-teste-da-fumaca-com-mais-de-32-caracteres-ok";
const ID_ADMIN = "aaaaaaaa-0000-4000-8000-000000000001";
const ID_CLIENTE = "bbbbbbbb-0000-4000-8000-000000000002";
const ID_OPERADOR = "cccccccc-0000-4000-8000-000000000003";

const PERFIL_NO_BANCO = new Map<string, string>([
  [ID_ADMIN, "ADMIN"],
  [ID_CLIENTE, "CLIENTE"],
  [ID_OPERADOR, "OPERADOR"],
]);

const LINHA = {
  id: "r-1", codigo: "BIC-1", status: "CONFIRMADA", cliente_id: "c-1", cliente_nome: "Maria", tipo_id: "t-1", tipo_nome: "Urbana",
  bicicleta_id: "b-1", bicicleta_codigo: "BIC-003", inicio: new Date("2026-11-14T12:00:00Z"), fim: new Date("2026-11-14T16:00:00Z"), valor_aluguel_centavos: 4000,
};

const consultas: { sql: string; valores?: unknown[] }[] = [];

function clienteFalso() {
  return {
    async query(sql: string, valores?: unknown[]) {
      consultas.push({ sql, valores });
      if (/FROM usuario WHERE id = \$1/.test(sql)) {
        const perfil = PERFIL_NO_BANCO.get(String(valores?.[0]));
        return { rows: perfil ? [{ perfil, ativo: true }] : [] };
      }
      if (/FROM reserva r/.test(sql)) return { rows: [LINHA] };
      return { rows: [] };
    },
    release() {},
  };
}

function token(sub: string, perfil: string) {
  const b64 = (dados: string) => Buffer.from(dados).toString("base64url");
  const iat = Math.floor(Date.now() / 1000);
  const cabecalho = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const corpo = b64(JSON.stringify({ sub, perfil, iat, exp: iat + 600 }));
  const assinatura = createHmac("sha256", SEGREDO).update(`${cabecalho}.${corpo}`).digest("base64url");
  return `${cabecalho}.${corpo}.${assinatura}`;
}

type ModuloDeRota = Record<string, unknown>;
let rota: ModuloDeRota;
let segredoAnterior: string | undefined;

before(async () => {
  segredoAnterior = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SEGREDO;
  (globalThis as { __bikeIlhaPool?: unknown }).__bikeIlhaPool = {
    connect: async () => clienteFalso(),
    query: (sql: string, valores?: unknown[]) => clienteFalso().query(sql, valores),
    on() {},
  };
  rota = await import("./admin/reservas/route.ts");
});

after(() => {
  if (segredoAnterior === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = segredoAnterior;
  delete (globalThis as { __bikeIlhaPool?: unknown }).__bikeIlhaPool;
});

async function chamar(consulta = "", bearer?: string) {
  consultas.length = 0;
  const GET = rota.GET as (request: Request) => Promise<Response>;
  assert.equal(typeof GET, "function", "route.ts não exporta GET");
  return GET(new Request(`http://localhost/api/admin/reservas${consulta}`, { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} }));
}
const tocouNasReservas = () => consultas.some((c) => /FROM reserva|expirar_reservas_vencidas/.test(c.sql));

test("o route.ts exporta só o GET (nenhum método a mais abrindo uma rota sem guarda)", () => {
  assert.deepEqual(Object.keys(rota).filter((k) => /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(k)), ["GET"]);
});

test("sem token: 401 pelo exigirSessao real, sem tocar nas reservas nem consultar o usuário", async () => {
  const r = await chamar();
  assert.equal(r.status, 401);
  assert.equal(tocouNasReservas(), false);
  assert.equal(consultas.some((c) => /FROM usuario/.test(c.sql)), false);
});

test("token com assinatura errada responde 401", async () => {
  const [c, p, a] = token(ID_ADMIN, "ADMIN").split(".");
  const adulterado = `${c}.${p}.${a[0] === "A" ? "B" : "A"}${a.slice(1)}`;
  assert.equal((await chamar("", adulterado)).status, 401);
  assert.equal(tocouNasReservas(), false);
});

test("conta que não existe mais responde 401", async () => {
  assert.equal((await chamar("", token("dddddddd-0000-4000-8000-000000000004", "ADMIN"))).status, 401);
  assert.equal(tocouNasReservas(), false);
});

test("o perfil vale o do banco, não o do token: token de ADMIN de uma conta que é CLIENTE leva 403", async () => {
  const r = await chamar("", token(ID_CLIENTE, "ADMIN"));
  assert.equal(r.status, 403);
  assert.equal(tocouNasReservas(), false);
});

test("cliente com token válido recebe 403 e as reservas não são lidas", async () => {
  assert.equal((await chamar("", token(ID_CLIENTE, "CLIENTE"))).status, 403);
  assert.equal(tocouNasReservas(), false);
});

test("operador recebe 200 com a reserva, o cliente e a unidade", async () => {
  const r = await chamar("?status=CONFIRMADA&data=2026-11-14", token(ID_OPERADOR, "OPERADOR"));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const corpo = (await r.json()) as { data: { cliente: { nome: string }; bicicleta: { codigo: string }; periodo: { inicio: string } }[] };
  assert.equal(corpo.data[0].cliente.nome, "Maria");
  assert.equal(corpo.data[0].bicicleta.codigo, "BIC-003");
  assert.equal(corpo.data[0].periodo.inicio, "2026-11-14T12:00:00.000Z");
});

test("a sessão é declarada no banco (RLS) e as pendentes vencidas são expiradas ANTES de listar", async () => {
  await chamar("", token(ID_ADMIN, "ADMIN"));
  const sqls = consultas.map((c) => c.sql);
  const declarada = consultas.find((c) => /set_config\('app\.perfil'/.test(c.sql));
  assert.deepEqual(declarada?.valores, ["ADMIN", ID_ADMIN]);
  const iExpirar = sqls.findIndex((s) => /expirar_reservas_vencidas/.test(s));
  const iListar = sqls.findIndex((s) => /FROM reserva r/.test(s));
  assert.ok(sqls.indexOf("BEGIN") < iExpirar && iExpirar < iListar && iListar < sqls.indexOf("COMMIT"), sqls.join(" | "));
});

test("filtro inválido é 400 e as reservas não são lidas", async () => {
  const r = await chamar("?data=2026-02-30", token(ID_OPERADOR, "OPERADOR"));
  assert.equal(r.status, 400);
  assert.equal(tocouNasReservas(), false);
});
