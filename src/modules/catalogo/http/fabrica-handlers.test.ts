import assert from "node:assert/strict";
import { test } from "node:test";
import { VISITANTE, type PerfilSessao, type SessaoBanco } from "../../../shared/db/sessao.ts";
import { UnauthorizedError } from "../../../shared/http/errors.ts";
import { criarCatalogo, type RepositorioCatalogo } from "../application/catalogo.ts";
import { criarHandlersCatalogo, type Catalogo } from "./fabrica-handlers.ts";

// Estes testes provam que CADA rota do painel exige sessão (401) e perfil ADMIN (403) antes de
// tocar o catálogo. O PerfisPermitidos é o de verdade (shared/http/perfis-permitidos.ts). O exigirSessao é de
// mentira: ele modela só o que o módulo contas garante (sem token ou token inválido é 401; com
// token, devolve o perfil da conta), e a regra do próprio exigirSessao tem testes em contas.

const ID_ADMIN = "aaaaaaaa-0000-4000-8000-000000000001";
const ID_CLIENTE = "bbbbbbbb-0000-4000-8000-000000000002";
const ID_OPERADOR = "cccccccc-0000-4000-8000-000000000003";
const ID_RECURSO = "dddddddd-0000-4000-8000-000000000004";
const ID_PONTO = "eeeeeeee-0000-4000-8000-000000000005";
const ID_PONTO_INATIVO = "eeeeeeee-0000-4000-8000-0000000000ff";

// O ponto como o contrato (rota 9) e o PontoDaEmpresa da tela de reserva esperam.
const PONTO_PUBLICO = {
  id: ID_PONTO,
  nome: "Ponto Litorânea",
  logradouro: "Av. Litorânea",
  numero: "100",
  complemento: null,
  bairro: "Calhau",
  cep: "65071380",
  cidade: "São Luís",
  uf: "MA",
  telefone: "(98) 90000-0000",
  horarios: [{ diaSemana: 1, abre: "08:00", fecha: "18:00" }],
};
const EMPRESA_PUBLICA = {
  nomeFantasia: "Bike Ilha Club",
  telefone: "(98) 90000-0000",
  email: "contato@exemplo.com",
  pontos: [PONTO_PUBLICO],
};

const CONTAS: Record<string, { usuarioId: string; perfil: PerfilSessao }> = {
  "token-admin": { usuarioId: ID_ADMIN, perfil: "ADMIN" },
  "token-cliente": { usuarioId: ID_CLIENTE, perfil: "CLIENTE" },
  "token-operador": { usuarioId: ID_OPERADOR, perfil: "OPERADOR" },
};

function montar() {
  const chamadas: { metodo: string; sessao: SessaoBanco }[] = [];
  let consultasDeSessao = 0;

  const registra = (metodo: string, resultado: unknown) => async (sessao: SessaoBanco) => {
    chamadas.push({ metodo, sessao });
    return resultado;
  };
  const catalogo = {
    obterEmpresaPublica: registra("obterEmpresaPublica", EMPRESA_PUBLICA),
    listarTiposPublicos: registra("listarTiposPublicos", []),
    listarTiposAdmin: registra("listarTiposAdmin", []),
    criarTipo: registra("criarTipo", { id: ID_RECURSO }),
    atualizarTipo: registra("atualizarTipo", { id: ID_RECURSO }),
    listarBicicletas: registra("listarBicicletas", []),
    criarBicicleta: registra("criarBicicleta", { id: ID_RECURSO }),
    atualizarBicicleta: registra("atualizarBicicleta", { id: ID_RECURSO }),
  } as unknown as Catalogo;

  const handlers = criarHandlersCatalogo({
    exigirSessao: async (request) => {
      consultasDeSessao++;
      const cabecalho = request.headers.get("authorization") ?? "";
      const token = /^Bearer (\S+)$/.exec(cabecalho)?.[1];
      const conta = token ? CONTAS[token] : undefined;
      if (!conta) throw new UnauthorizedError("Sessão inválida ou expirada.");
      return conta;
    },
    catalogo,
  });
  return { handlers, chamadas, consultas: () => consultasDeSessao };
}

type Handlers = ReturnType<typeof montar>["handlers"];

function pedido(metodo: string, token?: string, corpo: string | undefined = "{}") {
  return new Request("http://localhost/api/admin/qualquer", {
    method: metodo,
    headers: token ? { authorization: `Bearer ${token}`, "content-type": "application/json" } : {},
    body: metodo === "GET" ? undefined : corpo,
  });
}

// As 6 rotas do painel (rotas 19 a 24 do contrato).
const ROTAS: {
  nome: string;
  metodo: string;
  sucesso: number;
  chamar: (h: Handlers, r: Request) => Promise<Response>;
  usaCatalogo: string;
}[] = [
  { nome: "GET /api/admin/tipos", metodo: "GET", sucesso: 200, usaCatalogo: "listarTiposAdmin", chamar: (h, r) => h.getAdminTipos(r) },
  { nome: "POST /api/admin/tipos", metodo: "POST", sucesso: 201, usaCatalogo: "criarTipo", chamar: (h, r) => h.postAdminTipos(r) },
  { nome: "PUT /api/admin/tipos/{id}", metodo: "PUT", sucesso: 200, usaCatalogo: "atualizarTipo", chamar: (h, r) => h.putAdminTipo(r, ID_RECURSO) },
  { nome: "GET /api/admin/bicicletas", metodo: "GET", sucesso: 200, usaCatalogo: "listarBicicletas", chamar: (h, r) => h.getAdminBicicletas(r) },
  { nome: "POST /api/admin/bicicletas", metodo: "POST", sucesso: 201, usaCatalogo: "criarBicicleta", chamar: (h, r) => h.postAdminBicicletas(r) },
  { nome: "PATCH /api/admin/bicicletas/{id}", metodo: "PATCH", sucesso: 200, usaCatalogo: "atualizarBicicleta", chamar: (h, r) => h.patchAdminBicicleta(r, ID_RECURSO) },
];

async function corpoDe(resposta: Response) {
  return (await resposta.json()) as { data?: unknown; error?: { code: string } };
}

for (const rota of ROTAS) {
  test(`${rota.nome}: sem token responde 401 e não toca o catálogo`, async () => {
    const { handlers, chamadas } = montar();
    const resposta = await rota.chamar(handlers, pedido(rota.metodo));
    assert.equal(resposta.status, 401);
    assert.equal((await corpoDe(resposta)).error?.code, "UNAUTHORIZED");
    assert.deepEqual(chamadas, [], "o catálogo não pode ser chamado sem sessão");
  });

  test(`${rota.nome}: token inválido responde 401 e não toca o catálogo`, async () => {
    const { handlers, chamadas } = montar();
    for (const token of ["lixo", "token-de-outra-pessoa", "token-admin-"]) {
      const resposta = await rota.chamar(handlers, pedido(rota.metodo, token));
      assert.equal(resposta.status, 401, token);
    }
    assert.deepEqual(chamadas, []);
  });

  test(`${rota.nome}: CLIENTE responde 403 e não toca o catálogo`, async () => {
    const { handlers, chamadas } = montar();
    const resposta = await rota.chamar(handlers, pedido(rota.metodo, "token-cliente"));
    assert.equal(resposta.status, 403);
    assert.equal((await corpoDe(resposta)).error?.code, "FORBIDDEN");
    assert.deepEqual(chamadas, [], "um cliente não pode mexer no catálogo");
  });

  test(`${rota.nome}: OPERADOR responde 403 e não toca o catálogo`, async () => {
    const { handlers, chamadas } = montar();
    const resposta = await rota.chamar(handlers, pedido(rota.metodo, "token-operador"));
    assert.equal(resposta.status, 403);
    assert.equal((await corpoDe(resposta)).error?.code, "FORBIDDEN");
    assert.deepEqual(chamadas, [], "no catálogo só o ADMIN escreve");
  });

  test(`${rota.nome}: ADMIN passa, e o catálogo recebe a sessão dele (a que o comSessao usa na RLS)`, async () => {
    const { handlers, chamadas } = montar();
    const resposta = await rota.chamar(handlers, pedido(rota.metodo, "token-admin"));
    assert.equal(resposta.status, rota.sucesso);
    assert.equal(resposta.headers.get("cache-control"), "no-store");
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].metodo, rota.usaCatalogo);
    assert.deepEqual(chamadas[0].sessao, { usuarioId: ID_ADMIN, perfil: "ADMIN" });
  });

  test(`${rota.nome}: a sessão é conferida ANTES de ler o corpo (401 e 403 ganham do 400)`, async () => {
    if (rota.metodo === "GET") return; // GET não tem corpo
    const quebrado = "{isto não é json";
    const { handlers, chamadas } = montar();
    assert.equal((await rota.chamar(handlers, pedido(rota.metodo, undefined, quebrado))).status, 401);
    assert.equal((await rota.chamar(handlers, pedido(rota.metodo, "token-cliente", quebrado))).status, 403);
    assert.equal((await rota.chamar(handlers, pedido(rota.metodo, "token-admin", quebrado))).status, 400);
    assert.deepEqual(chamadas, [], "corpo inválido nunca chega ao catálogo");
  });
}

// Quem prova a ORDEM (o 401 antes do 403) são os testes de cima: sem token o resultado é 401, não
// 403, e o catálogo não é chamado. Este só prova que a sessão é consultada, uma vez por requisição,
// em todas as rotas do painel (e não, por exemplo, duas vezes ou nenhuma).
test("cada rota do painel consulta a sessão exatamente uma vez por requisição", async () => {
  const { handlers, consultas } = montar();
  for (const rota of ROTAS) await rota.chamar(handlers, pedido(rota.metodo));
  assert.equal(consultas(), ROTAS.length, "uma consulta de sessão por rota, sem repetir nem pular");
});

test("o id da URL chega ao caso de uso (PUT de tipo e PATCH de bicicleta)", async () => {
  const ids: unknown[] = [];
  const catalogo = {
    atualizarTipo: async (_s: SessaoBanco, id: string) => (ids.push(id), { id }),
    atualizarBicicleta: async (_s: SessaoBanco, id: string) => (ids.push(id), { id }),
  } as unknown as Catalogo;
  const handlers = criarHandlersCatalogo({
    exigirSessao: async () => CONTAS["token-admin"],
    catalogo,
  });
  await handlers.putAdminTipo(pedido("PUT", "x"), ID_RECURSO);
  await handlers.patchAdminBicicleta(pedido("PATCH", "x"), ID_RECURSO);
  assert.deepEqual(ids, [ID_RECURSO, ID_RECURSO]);
});

// ---------------------------------------------------------------------------
// A rota pública não pede token
// ---------------------------------------------------------------------------
test("GET /api/catalogo/tipos é público: sem token responde 200 e nem consulta a sessão", async () => {
  const { handlers, chamadas, consultas } = montar();
  const resposta = await handlers.getTiposPublicos();
  assert.equal(resposta.status, 200);
  assert.equal(consultas(), 0, "a rota pública não pode exigir sessão");
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].metodo, "listarTiposPublicos");
  assert.deepEqual(chamadas[0].sessao, VISITANTE, "usa a sessão de visitante (RLS pública)");
});

// ---------------------------------------------------------------------------
// GET /api/empresa (rota 9): pública, e nunca vaza dado interno da locadora
// ---------------------------------------------------------------------------
// Handlers com o caso de uso de verdade (criarCatalogo) e só o repositório de mentira, para provar
// o que sai na resposta HTTP. O exigirSessao falha se for chamado: a rota não pode pedir token.
function handlersComRepositorio(obterEmpresaPublica: RepositorioCatalogo["obterEmpresaPublica"]) {
  const sessoes: SessaoBanco[] = [];
  const repositorio = {
    obterEmpresaPublica: async (sessao: SessaoBanco) => {
      sessoes.push(sessao);
      return obterEmpresaPublica(sessao);
    },
  } as unknown as RepositorioCatalogo;
  const handlers = criarHandlersCatalogo({
    exigirSessao: async () => {
      throw new Error("a rota pública não pode exigir sessão");
    },
    catalogo: criarCatalogo(repositorio),
  });
  return { handlers, sessoes };
}

test("GET /api/empresa é público: sem token responde 200, sem cache, e nem consulta a sessão", async () => {
  const { handlers, chamadas, consultas } = montar();
  const resposta = await handlers.getEmpresaPublica();
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get("cache-control"), "no-store");
  assert.equal(consultas(), 0, "a rota pública não pode exigir sessão");
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].metodo, "obterEmpresaPublica");
  assert.deepEqual(chamadas[0].sessao, VISITANTE, "usa a sessão de visitante (RLS pública)");
  assert.deepEqual(await resposta.json(), { data: EMPRESA_PUBLICA });
});

test("GET /api/empresa traz pontos no formato do contrato (a tela de reserva lê pontos[0])", async () => {
  const { handlers, sessoes } = handlersComRepositorio(async () => ({
    ...EMPRESA_PUBLICA,
    pontos: [{ ...PONTO_PUBLICO, ativo: true }],
  }));
  const resposta = await handlers.getEmpresaPublica();
  assert.equal(resposta.status, 200);
  const { data } = await resposta.json();
  assert.ok(Array.isArray(data.pontos), "pontos precisa ser uma lista, mesmo vazia");
  assert.deepEqual(data.pontos[0], PONTO_PUBLICO);
  assert.deepEqual(data.pontos[0].horarios[0], { diaSemana: 1, abre: "08:00", fecha: "18:00" });
  assert.deepEqual(sessoes, [VISITANTE]);
});

test("GET /api/empresa sem locadora cadastrada responde 404 no formato de erro do contrato", async () => {
  const { handlers } = handlersComRepositorio(async () => null);
  const resposta = await handlers.getEmpresaPublica();
  assert.equal(resposta.status, 404);
  const corpo = await resposta.json();
  assert.equal(corpo.error.code, "NOT_FOUND");
  assert.equal(typeof corpo.error.message, "string");
  assert.equal(corpo.data, undefined);
});

test("GET /api/empresa nunca devolve CNPJ, razão social, conta de recebimento, campos de controle nem ponto inativo", async () => {
  // O repositório "vaza" de propósito: a resposta tem que sair só com os campos do contrato.
  const { handlers } = handlersComRepositorio(async () => ({
    ...EMPRESA_PUBLICA,
    cnpj: "11222333000181",
    razaoSocial: "Bike Ilha Locações LTDA",
    contaRecebimento: "conta-mp-123",
    documentosExigidos: ["CNH"],
    criadoEm: "2026-01-01T00:00:00Z",
    pontos: [
      { ...PONTO_PUBLICO, ativo: true, localizacao: "POINT(-44.2 -2.5)", criadoEm: "2026-01-01T00:00:00Z" },
      { ...PONTO_PUBLICO, id: ID_PONTO_INATIVO, nome: "Ponto Fechado", ativo: false },
    ],
  }) as never);
  const resposta = await handlers.getEmpresaPublica();
  assert.equal(resposta.status, 200);
  const { data } = await resposta.json();

  assert.deepEqual(Object.keys(data).sort(), ["email", "nomeFantasia", "pontos", "telefone"]);
  assert.equal(data.pontos.length, 1, "só os pontos ativos");
  assert.equal(data.pontos[0].id, ID_PONTO);
  assert.deepEqual(Object.keys(data.pontos[0]).sort(), Object.keys(PONTO_PUBLICO).sort());

  const texto = JSON.stringify(data);
  for (const proibido of ["cnpj", "11222333000181", "razaoSocial", "contaRecebimento", "criadoEm", "ativo", "localizacao"]) {
    assert.ok(!texto.includes(proibido), `a resposta não pode conter ${proibido}`);
  }
});
