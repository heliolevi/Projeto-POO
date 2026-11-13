import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";

// Teste de fumaça das rotas do catálogo: carrega os arquivos route.ts de verdade, que chamam o
// handlers.ts, que liga o exigirSessao REAL do módulo contas e o exigirPerfil. Só o banco é de
// mentira (um pool que responde "qual é o perfil deste usuário?"). Assim, se uma rota passar a
// chamar outro handler, se o handlers.ts deixar de ligar o exigirSessao do contas, ou se alguém
// esquecer a guarda numa rota, a CI pega: antes, isso só era conferido à mão no Neon.
//
// A lógica fina (cada caso de 401 e 403, a ordem sobre o corpo, o id da URL) está em
// src/modules/catalogo/http/fabrica-handlers.test.ts. Aqui o que se prova é a LIGAÇÃO.

const SEGREDO = "segredo-de-teste-da-fumaca-com-mais-de-32-caracteres-ok";
const ID_ADMIN = "aaaaaaaa-0000-4000-8000-000000000001";
const ID_CLIENTE = "bbbbbbbb-0000-4000-8000-000000000002";
const ID_OPERADOR = "cccccccc-0000-4000-8000-000000000003";
const ID_SEM_CONTA = "dddddddd-0000-4000-8000-000000000004";
const ID_RECURSO = "eeeeeeee-0000-4000-8000-000000000005";

// O "banco": o perfil de cada conta ativa. O ID_SEM_CONTA não existe.
const PERFIL_NO_BANCO = new Map<string, string>([
  [ID_ADMIN, "ADMIN"],
  [ID_CLIENTE, "CLIENTE"],
  [ID_OPERADOR, "OPERADOR"],
]);

const consultas: string[] = [];

function clienteFalso() {
  return {
    async query(sql: string, valores?: unknown[]) {
      consultas.push(sql);
      if (/FROM usuario WHERE id = \$1/.test(sql)) {
        const perfil = PERFIL_NO_BANCO.get(String(valores?.[0]));
        return { rows: perfil ? [{ perfil, ativo: true }] : [] };
      }
      return { rows: [] };
    },
    release() {},
  };
}

// Token no formato do módulo contas (JWT HS256), assinado com o mesmo segredo.
function token(sub: string, perfil: string, expiraEmSegundos = 600) {
  const b64 = (dados: string) => Buffer.from(dados).toString("base64url");
  const iat = Math.floor(Date.now() / 1000);
  const cabecalho = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const corpo = b64(JSON.stringify({ sub, perfil, iat, exp: iat + expiraEmSegundos }));
  const assinatura = createHmac("sha256", SEGREDO).update(`${cabecalho}.${corpo}`).digest("base64url");
  return `${cabecalho}.${corpo}.${assinatura}`;
}

type Manipulador = (request: Request, contexto?: unknown) => Promise<Response>;
type ModuloDeRota = Record<string, unknown>;

let tipos: ModuloDeRota;
let tipoPorId: ModuloDeRota;
let bicicletas: ModuloDeRota;
let bicicletaPorId: ModuloDeRota;
let publica: ModuloDeRota;

let segredoAnterior: string | undefined;
before(async () => {
  segredoAnterior = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SEGREDO;
  // o pool do app é criado no primeiro uso e guardado aqui (src/shared/db/pool.ts)
  (globalThis as { __bikeIlhaPool?: unknown }).__bikeIlhaPool = {
    connect: async () => clienteFalso(),
    query: (sql: string, valores?: unknown[]) => clienteFalso().query(sql, valores),
    on() {},
  };
  tipos = await import("./admin/tipos/route.ts");
  tipoPorId = await import("./admin/tipos/[id]/route.ts");
  bicicletas = await import("./admin/bicicletas/route.ts");
  bicicletaPorId = await import("./admin/bicicletas/[id]/route.ts");
  publica = await import("./catalogo/tipos/route.ts");
});

after(() => {
  if (segredoAnterior === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = segredoAnterior;
  delete (globalThis as { __bikeIlhaPool?: unknown }).__bikeIlhaPool;
});

const REQUISICAO_SEM_CORPO = ["GET"];

function pedido(metodo: string, bearer?: string) {
  return new Request("http://localhost/api/qualquer", {
    method: metodo,
    headers: bearer ? { authorization: `Bearer ${bearer}`, "content-type": "application/json" } : {},
    body: REQUISICAO_SEM_CORPO.includes(metodo) ? undefined : "{}",
  });
}

// As 6 rotas do painel. `aoPassarAGuarda` é o que a rota devolve quando a guarda deixa passar e o
// corpo é `{}`: as de leitura dão 200 (lista vazia) e as de escrita dão 400 (validação).
const ROTAS: { nome: string; modulo: () => ModuloDeRota; metodo: string; aoPassarAGuarda: number }[] = [
  { nome: "GET /api/admin/tipos", modulo: () => tipos, metodo: "GET", aoPassarAGuarda: 200 },
  { nome: "POST /api/admin/tipos", modulo: () => tipos, metodo: "POST", aoPassarAGuarda: 400 },
  { nome: "PUT /api/admin/tipos/{id}", modulo: () => tipoPorId, metodo: "PUT", aoPassarAGuarda: 400 },
  { nome: "GET /api/admin/bicicletas", modulo: () => bicicletas, metodo: "GET", aoPassarAGuarda: 200 },
  { nome: "POST /api/admin/bicicletas", modulo: () => bicicletas, metodo: "POST", aoPassarAGuarda: 400 },
  { nome: "PATCH /api/admin/bicicletas/{id}", modulo: () => bicicletaPorId, metodo: "PATCH", aoPassarAGuarda: 400 },
];

async function chamar(rota: (typeof ROTAS)[number], bearer?: string) {
  const manipulador = rota.modulo()[rota.metodo] as Manipulador;
  assert.equal(typeof manipulador, "function", `${rota.nome}: o arquivo route.ts não exporta ${rota.metodo}`);
  consultas.length = 0;
  return manipulador(pedido(rota.metodo, bearer), { params: Promise.resolve({ id: ID_RECURSO }) });
}

const tocouNoCatalogo = () => consultas.some((sql) => /tipo_bicicleta|bicicleta/.test(sql));

test("cada arquivo route.ts exporta só os métodos do contrato (nenhum a mais abrindo uma rota sem guarda)", () => {
  const metodosHttp = (modulo: ModuloDeRota) =>
    Object.keys(modulo).filter((chave) => /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(chave)).sort();
  assert.deepEqual(metodosHttp(tipos), ["GET", "POST"]);
  assert.deepEqual(metodosHttp(tipoPorId), ["PUT"]);
  assert.deepEqual(metodosHttp(bicicletas), ["GET", "POST"]);
  assert.deepEqual(metodosHttp(bicicletaPorId), ["PATCH"]);
  assert.deepEqual(metodosHttp(publica), ["GET"]);
});

for (const rota of ROTAS) {
  test(`${rota.nome}: sem token responde 401 pelo exigirSessao real, sem tocar o catálogo`, async () => {
    const resposta = await chamar(rota);
    assert.equal(resposta.status, 401);
    assert.equal(tocouNoCatalogo(), false);
    assert.equal(consultas.some((sql) => /FROM usuario/.test(sql)), false, "sem token nem se consulta o banco");
  });

  test(`${rota.nome}: token com assinatura errada ou expirado responde 401`, async () => {
    // Troca o PRIMEIRO caractere da assinatura, que usa os 6 bits do base64url e sempre muda os
    // bytes. Trocar o último não serve: ele carrega só 4 bits úteis, então A, B, C e D decodificam
    // igual e a "adulteração" some em cerca de 6% dos segundos (o token depende da hora).
    const [cabecalho, corpo, assinatura] = token(ID_ADMIN, "ADMIN").split(".");
    const adulterado = `${cabecalho}.${corpo}.${assinatura[0] === "A" ? "B" : "A"}${assinatura.slice(1)}`;
    assert.notDeepEqual(
      Buffer.from(adulterado.split(".")[2], "base64url"),
      Buffer.from(assinatura, "base64url"),
      "a assinatura adulterada precisa decodificar para bytes diferentes",
    );
    assert.equal((await chamar(rota, adulterado)).status, 401);
    assert.equal((await chamar(rota, token(ID_ADMIN, "ADMIN", -60))).status, 401, "expirado");
    assert.equal(tocouNoCatalogo(), false);
  });

  test(`${rota.nome}: token de conta que não existe mais responde 401 (o exigirSessao confere o banco)`, async () => {
    assert.equal((await chamar(rota, token(ID_SEM_CONTA, "ADMIN"))).status, 401);
    assert.equal(tocouNoCatalogo(), false);
  });

  test(`${rota.nome}: CLIENTE e OPERADOR respondem 403, sem tocar o catálogo`, async () => {
    for (const [id, perfil] of [[ID_CLIENTE, "CLIENTE"], [ID_OPERADOR, "OPERADOR"]]) {
      const resposta = await chamar(rota, token(id, perfil));
      assert.equal(resposta.status, 403, perfil);
      assert.equal(tocouNoCatalogo(), false, `${perfil} não pode chegar ao catálogo`);
    }
  });

  test(`${rota.nome}: o perfil vale o do BANCO, e não o que está dentro do token`, async () => {
    // token de uma conta CLIENTE que afirma ser ADMIN: o exigirSessao usa o perfil do banco
    assert.equal((await chamar(rota, token(ID_CLIENTE, "ADMIN"))).status, 403);
    assert.equal(tocouNoCatalogo(), false);
  });

  test(`${rota.nome}: ADMIN passa pela guarda e chega ao catálogo`, async () => {
    const resposta = await chamar(rota, token(ID_ADMIN, "ADMIN"));
    assert.equal(resposta.status, rota.aoPassarAGuarda);
    if (rota.metodo === "GET") {
      assert.equal(tocouNoCatalogo(), true, "a leitura deveria ter ido ao banco");
    }
  });
}

test("GET /api/catalogo/tipos é público: sem token responde 200 e nem consulta o usuário", async () => {
  consultas.length = 0;
  const resposta = await (publica.GET as Manipulador)(pedido("GET"));
  assert.equal(resposta.status, 200);
  assert.equal(consultas.some((sql) => /FROM usuario/.test(sql)), false, "a rota pública não pode exigir sessão");
  assert.equal(tocouNoCatalogo(), true);
});
