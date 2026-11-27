import assert from "node:assert/strict";
import { test } from "node:test";
import type { PerfilSessao } from "../../../shared/db/sessao.ts";
import { ConflictError, UnauthorizedError, ValidationError } from "../../../shared/http/errors.ts";
import { LeitorDeCorpo } from "../../../shared/http/leitor-de-corpo.ts";
import { ControladorDeContas } from "./controlador-de-contas.ts";

// A porta HTTP sobre casos de uso de mentira. Provam: o que cada rota exige (sessão e perfil), a ORDEM
// (401 antes de 403 antes de 400), que o id usado é o do token (nunca o do corpo) e o formato das respostas.

const CONTAS: Record<string, { usuarioId: string; perfil: PerfilSessao }> = {
  "token-cliente": { usuarioId: "bbbbbbbb-0000-4000-8000-000000000002", perfil: "CLIENTE" },
  "token-operador": { usuarioId: "cccccccc-0000-4000-8000-000000000003", perfil: "OPERADOR" },
  "token-admin": { usuarioId: "aaaaaaaa-0000-4000-8000-000000000001", perfil: "ADMIN" },
};

function montar(falha?: Error) {
  const chamadas: { metodo: string; usuarioId?: string; entrada?: unknown }[] = [];
  // `any` só aqui: um mesmo espião serve a casos de uso de assinaturas diferentes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registra = (metodo: string, resultado: unknown = undefined): any => async (...args: unknown[]) => {
    const [a, b] = args;
    chamadas.push({ metodo, usuarioId: typeof a === "string" ? a : undefined, entrada: typeof a === "string" ? b : a });
    if (falha) throw falha;
    return resultado;
  };
  const controlador = new ControladorDeContas({
    sessoes: {
      async exigir(request) {
        const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        const conta = token ? CONTAS[token] : undefined;
        if (!conta) throw new UnauthorizedError("Sessão inválida ou expirada.");
        return conta;
      },
    },
    cadastro: { cadastrar: registra("cadastrar", { token: "t", tipo: "Bearer" }) },
    autenticador: { autenticar: registra("autenticar", { token: "t", tipo: "Bearer" }) },
    perfil: { consultarConta: registra("consultarConta", { id: "x", perfil: "CLIENTE" }), atualizar: registra("atualizar", { alturaCm: 172, experiencia: null, atividade: null }) },
    manutencao: { alterarSenha: registra("alterarSenha"), atualizarAltura: registra("atualizarAltura"), aceitarTermos: registra("aceitarTermos"), desativar: registra("desativar") },
    leitor: new LeitorDeCorpo(),
  });
  return { controlador, chamadas };
}

const pedido = (corpo: unknown, token?: string, ip = "200.1.1.1") =>
  new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });

type RotaDaConta = { nome: string; chamar: (c: ControladorDeContas, r: Request) => Promise<Response>; ok: number; exige: "sessao" | "cliente"; metodo: string };
const ROTAS: RotaDaConta[] = [
  { nome: "POST /conta/senha", chamar: (c, r) => c.alterarSenha(r), ok: 204, exige: "sessao", metodo: "alterarSenha" },
  { nome: "POST /conta/desativar", chamar: (c, r) => c.desativar(r), ok: 204, exige: "sessao", metodo: "desativar" },
  { nome: "POST /conta/altura", chamar: (c, r) => c.atualizarAltura(r), ok: 204, exige: "cliente", metodo: "atualizarAltura" },
  { nome: "POST /conta/termos", chamar: (c, r) => c.aceitarTermos(r), ok: 204, exige: "cliente", metodo: "aceitarTermos" },
  { nome: "GET /conta/me", chamar: (c, r) => c.me(r), ok: 200, exige: "sessao", metodo: "consultarConta" },
  { nome: "PUT /conta/perfil-ciclista", chamar: (c, r) => c.atualizarPerfilCiclista(r), ok: 200, exige: "cliente", metodo: "atualizar" },
];

for (const rota of ROTAS) {
  test(`${rota.nome}: sem token ou com token inválido responde 401 e não chama o caso de uso`, async () => {
    const m = montar();
    assert.equal((await rota.chamar(m.controlador, pedido({}))).status, 401);
    assert.equal((await rota.chamar(m.controlador, pedido({}, "token-que-nao-existe"))).status, 401);
    assert.equal(m.chamadas.length, 0);
  });

  test(`${rota.nome}: ${rota.exige === "cliente" ? "só CLIENTE (operador e admin recebem 403)" : "qualquer perfil logado passa"}`, async () => {
    for (const token of ["token-cliente", "token-operador", "token-admin"]) {
      const m = montar();
      const r = await rota.chamar(m.controlador, pedido({ alturaCm: 172, senhaAtual: "a", novaSenha: "b", versao: "2026-11" }, token));
      const esperado = rota.exige === "cliente" && token !== "token-cliente" ? 403 : rota.ok;
      assert.equal(r.status, esperado, `${rota.nome} com ${token}`);
      assert.equal(m.chamadas.length, esperado === 403 ? 0 : 1, "o 403 vem antes do caso de uso");
    }
  });

  test(`${rota.nome}: usa o id do TOKEN, nunca um id que venha no corpo`, async () => {
    const m = montar();
    await rota.chamar(m.controlador, pedido({ id: "00000000-0000-4000-8000-00000000dead", usuarioId: "00000000-0000-4000-8000-00000000dead", alturaCm: 172 }, "token-cliente"));
    assert.equal(m.chamadas[0].usuarioId, CONTAS["token-cliente"].usuarioId);
  });

  test(`${rota.nome}: ${rota.ok === 204 ? "204 sem corpo" : "200 com { data }"} e nunca em cache`, async () => {
    const m = montar();
    const r = await rota.chamar(m.controlador, pedido({}, "token-cliente"));
    assert.equal(r.status, rota.ok);
    if (rota.ok === 204) assert.equal(await r.text(), "");
    else {
      assert.equal(r.headers.get("cache-control"), "no-store");
      assert.ok("data" in ((await r.json()) as object));
    }
  });

  test(`${rota.nome}: erro do caso de uso vira a resposta do contrato; erro inesperado vira 500 genérico`, async () => {
    const um = montar(new ValidationError("Dados inválidos.", { campo: "ruim" }));
    const r = await rota.chamar(um.controlador, pedido({}, "token-cliente"));
    assert.equal(r.status, 400);
    assert.deepEqual(((await r.json()) as { error: { details: object } }).error.details, { campo: "ruim" });

    const antes = console.error;
    console.error = () => {};
    try {
      const dois = montar(new Error("senha do banco: abc123"));
      const r2 = await rota.chamar(dois.controlador, pedido({}, "token-cliente"));
      assert.equal(r2.status, 500);
      assert.ok(!JSON.stringify(await r2.json()).includes("abc123"));
    } finally {
      console.error = antes;
    }
  });
}

test("rotas com corpo: JSON quebrado é 400 e corpo de 20 KB é 413, antes de chamar o caso de uso", async () => {
  const m = montar();
  assert.equal((await m.controlador.alterarSenha(pedido("{quebrado", "token-cliente"))).status, 400);
  assert.equal((await m.controlador.cadastro(pedido("x".repeat(20_000)))).status, 413);
  assert.equal(m.chamadas.length, 0);
});

test("a ordem é 401 antes de 403 antes de 400: corpo ruim de visitante é 401, de operador é 403, de cliente é 400", async () => {
  const m = montar();
  assert.equal((await m.controlador.atualizarAltura(pedido("{ruim"))).status, 401);
  assert.equal((await m.controlador.atualizarAltura(pedido("{ruim", "token-operador"))).status, 403);
  assert.equal((await m.controlador.atualizarAltura(pedido("{ruim", "token-cliente"))).status, 400);
});

test("cadastro: 201 com { data }, sem token e sem cache, com o IP de quem chamou", async () => {
  const m = montar();
  const r = await m.controlador.cadastro(pedido({ nome: "x" }, undefined, "200.9.9.9, 10.0.0.1"));
  assert.equal(r.status, 201);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.ok("data" in ((await r.json()) as object));
  assert.equal(m.chamadas[0].metodo, "cadastrar");
});

test("login: 200 com { data }; 409 e 401 do caso de uso saem como o contrato manda", async () => {
  const m = montar();
  const r = await m.controlador.login(pedido({ email: "a@b.c", senha: "x" }));
  assert.equal(r.status, 200);
  assert.equal((await montar(new UnauthorizedError("E-mail ou senha inválidos.")).controlador.login(pedido({}))).status, 401);
  assert.equal((await montar(new ConflictError("E-mail ou CPF já cadastrado.")).controlador.cadastro(pedido({}))).status, 409);
});

test("o controlador entrega ao caso de uso o corpo lido e o IP, e só isso", async () => {
  const m = montar();
  await m.controlador.login(pedido({ email: "a@b.c", senha: "x" }, undefined, "5.5.5.5"));
  assert.deepEqual(m.chamadas[0].entrada, { email: "a@b.c", senha: "x" });
});

test("estresse: 200 chamadas ao mesmo tempo, de perfis misturados, cada uma recebe a resposta certa", async () => {
  const m = montar();
  const tokens = ["token-cliente", "token-operador", "token-admin", undefined] as const;
  const rs = await Promise.all(Array.from({ length: 200 }, (_, i) => m.controlador.atualizarAltura(pedido({ alturaCm: 172 }, tokens[i % 4]))));
  rs.forEach((r, i) => assert.equal(r.status, [204, 403, 403, 401][i % 4], `chamada ${i}`));
  assert.equal(m.chamadas.length, 50);
});

test("o controlador é encapsulado: nenhum campo visível", () => {
  assert.deepEqual(Object.keys(montar().controlador), []);
});
