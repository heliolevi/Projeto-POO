import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";

// Teste de fumaça das rotas 26 e 27: carrega os route.ts de verdade, que chamam o handlers.ts, que liga
// o exigirSessao REAL do módulo contas ao ControladorDeOperacao, ao OperacaoService e ao banco. Só o
// banco é de mentira (um pool que responde às consultas da operação). Se alguém trocar o handler,
// esquecer a guarda ou deixar de declarar a sessão no banco, a CI pega. A lógica fina está em
// controlador-de-operacao.test.ts e operacao-service.test.ts.

const SEGREDO = "segredo-de-teste-da-fumaca-com-mais-de-32-caracteres-ok";
const ID_ADMIN = "aaaaaaaa-0000-4000-8000-000000000001";
const ID_CLIENTE = "bbbbbbbb-0000-4000-8000-000000000002";
const ID_OPERADOR = "cccccccc-0000-4000-8000-000000000003";
const ID_RESERVA = "11111111-1111-4111-8111-111111111111";

const PERFIL_NO_BANCO = new Map<string, string>([
  [ID_ADMIN, "ADMIN"],
  [ID_CLIENTE, "CLIENTE"],
  [ID_OPERADOR, "OPERADOR"],
]);

const CORPO = JSON.stringify({ checklist: { itens: [{ nome: "freios", ok: true }], observacoes: "ok" } });

let statusDaReserva = "CONFIRMADA";
const consultas: { sql: string; valores?: unknown[] }[] = [];

function linhaDaReserva() {
  const inicio = new Date(Date.now() + 5 * 60_000);
  return {
    id: ID_RESERVA,
    codigo: "BIC-7K2F9Q",
    status: statusDaReserva,
    tipo_id: "t1",
    tipo_nome: "Urbana",
    ponto_id: "p1",
    ponto_nome: "Ponto Litorânea",
    ponto_endereco: "Av. Litorânea, 100",
    inicio,
    fim: new Date(inicio.getTime() + 4 * 3_600_000),
    valor_aluguel_centavos: 4000,
    valor_caucao_centavos: 15000,
    criado_em: new Date(inicio.getTime() - 86_400_000),
    pagamento_status: "APROVADO",
    pagamento_metodo: "PIX",
  };
}

function clienteFalso() {
  return {
    async query(sql: string, valores?: unknown[]) {
      consultas.push({ sql, valores });
      if (/FROM usuario WHERE id = \$1/.test(sql)) {
        const perfil = PERFIL_NO_BANCO.get(String(valores?.[0]));
        return { rows: perfil ? [{ perfil, ativo: true }] : [] };
      }
      if (/FROM reserva WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows: [{}], rowCount: 1 };
      if (/FROM reserva_detalhada/.test(sql)) return { rows: [linhaDaReserva()], rowCount: 1 };
      if (/FOR UPDATE OF b/.test(sql)) {
        return {
          rows: [{ id: "b1", codigo: "BIC-003", numero_serie: null, tamanho_quadro: null, status: "DISPONIVEL", observacoes: null, tipo_id: "t1", tipo_nome: "Urbana", ponto_id: "p1", ponto_nome: "Ponto Litorânea" }],
          rowCount: 1,
        };
      }
      if (/UPDATE reserva SET status/.test(sql)) return { rows: [], rowCount: 1 };
      if (/SELECT b\.id, b\.codigo FROM reserva r/.test(sql)) return { rows: [{ id: "b1", codigo: "BIC-003" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
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

type Rota = { POST: (request: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> };
let retirada: Rota;
let devolucao: Rota;
let segredoAnterior: string | undefined;

before(async () => {
  segredoAnterior = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SEGREDO;
  (globalThis as { __bikeIlhaPool?: unknown }).__bikeIlhaPool = Promise.resolve({
    connect: async () => clienteFalso(),
    query: (sql: string, valores?: unknown[]) => clienteFalso().query(sql, valores),
    on() {},
  });
  retirada = (await import("./operacao/reservas/[id]/retirada/route.ts")) as unknown as Rota;
  devolucao = (await import("./operacao/reservas/[id]/devolucao/route.ts")) as unknown as Rota;
});

after(() => {
  if (segredoAnterior === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = segredoAnterior;
  delete (globalThis as { __bikeIlhaPool?: unknown }).__bikeIlhaPool;
});

async function chamar(rota: Rota, bearer?: string, id = ID_RESERVA, corpo = CORPO) {
  consultas.length = 0;
  assert.equal(typeof rota.POST, "function", "route.ts não exporta POST");
  return rota.POST(
    new Request(`http://localhost/api/operacao/reservas/${id}/x`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
      body: corpo,
    }),
    { params: Promise.resolve({ id }) },
  );
}
const tocouNaReserva = () => consultas.some((c) => /FROM reserva|expirar_reservas_vencidas|movimentacao/.test(c.sql));

test("os route.ts exportam só o POST", () => {
  for (const rota of [retirada, devolucao]) {
    assert.deepEqual(Object.keys(rota).filter((k) => /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(k)), ["POST"]);
  }
});

test("sem token: 401 pelo exigirSessao real, sem tocar na reserva", async () => {
  for (const rota of [retirada, devolucao]) {
    const r = await chamar(rota);
    assert.equal(r.status, 401);
    assert.equal(tocouNaReserva(), false);
  }
});

test("cliente com token válido recebe 403 e a reserva não é lida", async () => {
  for (const rota of [retirada, devolucao]) {
    assert.equal((await chamar(rota, token(ID_CLIENTE, "CLIENTE"))).status, 403);
    assert.equal(tocouNaReserva(), false);
  }
});

test("o perfil vale o do banco, não o do token: token de OPERADOR de uma conta CLIENTE leva 403", async () => {
  assert.equal((await chamar(retirada, token(ID_CLIENTE, "OPERADOR"))).status, 403);
  assert.equal(tocouNaReserva(), false);
});

test("operador retira: 200 com a reserva EM_ANDAMENTO e a unidade, sem cache, sessão declarada no banco", async () => {
  statusDaReserva = "CONFIRMADA";
  const r = await chamar(retirada, token(ID_OPERADOR, "OPERADOR"));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const { data } = (await r.json()) as { data: { status: string; bicicleta: { codigo: string } } };
  assert.equal(data.status, "EM_ANDAMENTO");
  assert.equal(data.bicicleta.codigo, "BIC-003");
  const declarada = consultas.find((c) => /set_config\('app\.perfil'/.test(c.sql));
  assert.deepEqual(declarada?.valores, ["OPERADOR", ID_OPERADOR]);
  const sqls = consultas.map((c) => c.sql);
  const em = (re: RegExp) => sqls.findIndex((s) => re.test(s));
  assert.ok(
    em(/^BEGIN/) < em(/expirar_reservas_vencidas/) &&
      em(/expirar_reservas_vencidas/) < em(/FROM reserva WHERE id = \$1 FOR UPDATE/) &&
      em(/FROM reserva WHERE id = \$1 FOR UPDATE/) < em(/FOR UPDATE OF b/) &&
      em(/FOR UPDATE OF b/) < em(/INSERT INTO movimentacao/) &&
      em(/INSERT INTO movimentacao/) < em(/UPDATE reserva SET status/) &&
      em(/UPDATE reserva SET status/) < em(/^COMMIT/),
    sqls.join(" | "),
  );
});

test("administrador devolve: 200 com a reserva CONCLUIDA", async () => {
  statusDaReserva = "EM_ANDAMENTO";
  const r = await chamar(devolucao, token(ID_ADMIN, "ADMIN"));
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as { data: { status: string } }).data.status, "CONCLUIDA");
});

test("id inválido é 404 e o corpo quebrado só vira 400 com id válido", async () => {
  assert.equal((await chamar(retirada, token(ID_OPERADOR, "OPERADOR"), "abc", "{")).status, 404);
  assert.equal(tocouNaReserva(), false);
  assert.equal((await chamar(retirada, token(ID_OPERADOR, "OPERADOR"), ID_RESERVA, "{")).status, 400);
  assert.equal(tocouNaReserva(), false);
});

test("reserva que não está CONFIRMADA é 409 e nada é gravado", async () => {
  statusDaReserva = "CANCELADA";
  const r = await chamar(retirada, token(ID_OPERADOR, "OPERADOR"));
  assert.equal(r.status, 409);
  assert.ok(!consultas.some((c) => /INSERT INTO movimentacao/.test(c.sql)));
});
