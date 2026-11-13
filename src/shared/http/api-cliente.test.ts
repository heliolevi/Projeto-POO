import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { ApiError, getAutenticado, patchAutenticado, postAutenticado } from "./api-cliente.ts";

type Chamada = { url: string; init: RequestInit };

const globais = globalThis as Record<string, unknown>;
const fetchOriginal = globais.fetch;
const janelaOriginal = globais.window;

let chamadas: Chamada[];
let armazenamento: Map<string, string>;
let redirecionouPara: string | null;

function simularResposta(status: number, corpo: unknown) {
  globais.fetch = async (url: string, init: RequestInit = {}) => {
    chamadas.push({ url, init });
    return new Response(JSON.stringify(corpo), { status });
  };
}

beforeEach(() => {
  chamadas = [];
  armazenamento = new Map([["bik_token", "token-de-teste"]]);
  redirecionouPara = null;
  globais.window = {
    localStorage: {
      getItem: (chave: string) => armazenamento.get(chave) ?? null,
      removeItem: (chave: string) => armazenamento.delete(chave),
    },
    location: {
      origin: "http://localhost:3000",
      pathname: "/app/reservas",
      search: "?x=1",
      assign: (destino: string) => {
        redirecionouPara = destino;
      },
    },
  };
});

after(() => {
  globais.fetch = fetchOriginal;
  globais.window = janelaOriginal;
});

test("getAutenticado envia o token em Authorization e devolve data", async () => {
  simularResposta(200, { data: [{ id: "r1" }] });
  const resultado = await getAutenticado<{ id: string }[]>("/api/reservas");
  assert.deepEqual(resultado, [{ id: "r1" }]);
  assert.equal(
    (chamadas[0].init.headers as Record<string, string>).Authorization,
    "Bearer token-de-teste",
  );
});

test("postAutenticado manda o corpo em JSON e o token", async () => {
  simularResposta(200, { data: { ok: true } });
  await postAutenticado("/api/reservas/r1/cancelar");
  const { init } = chamadas[0];
  assert.equal(init.method, "POST");
  assert.equal(init.body, "{}");
  const cabecalhos = init.headers as Record<string, string>;
  assert.equal(cabecalhos["Content-Type"], "application/json");
  assert.equal(cabecalhos.Authorization, "Bearer token-de-teste");
});

test("erro da API vira ApiError com o código do contrato", async () => {
  simularResposta(404, { error: { code: "NOT_FOUND", message: "Reserva não encontrada." } });
  await assert.rejects(getAutenticado("/api/reservas/x"), (erro: unknown) => {
    assert.ok(erro instanceof ApiError);
    assert.equal(erro.code, "NOT_FOUND");
    assert.equal(erro.message, "Reserva não encontrada.");
    return true;
  });
  assert.equal(redirecionouPara, null);
  assert.equal(armazenamento.has("bik_token"), true);
});

test("401 apaga a sessão e leva ao login guardando a tela atual", async () => {
  simularResposta(401, { error: { code: "UNAUTHORIZED", message: "Sessão inválida." } });
  await assert.rejects(getAutenticado("/api/reservas"), ApiError);
  assert.equal(armazenamento.has("bik_token"), false);
  assert.equal(redirecionouPara, "http://localhost:3000/login?next=%2Fapp%2Freservas%3Fx%3D1");
});

test("resposta 204 sem corpo é sucesso (senha, altura e desativar)", async () => {
  globais.fetch = async (url: string, init: RequestInit = {}) => {
    chamadas.push({ url, init });
    return new Response(null, { status: 204 });
  };
  const resultado = await postAutenticado("/api/conta/desativar", {});
  assert.equal(resultado, undefined);
  assert.equal(redirecionouPara, null);
});

test("401 sem redirecionar mostra o erro e mantém a sessão (senha atual errada)", async () => {
  simularResposta(401, { error: { code: "UNAUTHORIZED", message: "Senha atual incorreta." } });
  await assert.rejects(
    () => postAutenticado("/api/conta/senha", {}, { sairSeNaoAutorizado: false }),
    (erro: unknown) => erro instanceof ApiError && erro.message === "Senha atual incorreta.",
  );
  assert.equal(redirecionouPara, null);
  assert.equal(armazenamento.get("bik_token"), "token-de-teste");
});

test("401 por padrão ainda apaga a sessão e vai para o login", async () => {
  simularResposta(401, { error: { code: "UNAUTHORIZED", message: "Não autenticado" } });
  await assert.rejects(() => postAutenticado("/api/conta/senha", {}));
  assert.equal(armazenamento.has("bik_token"), false);
  assert.ok(redirecionouPara?.includes("/login"));
});

test("rede caída vira ApiError com mensagem de sem conexão", async () => {
  globais.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(getAutenticado("/api/reservas"), (erro: unknown) => {
    assert.ok(erro instanceof ApiError);
    assert.equal(erro.code, "NETWORK_ERROR");
    assert.match(erro.message, /Sem conexão/);
    return true;
  });
  assert.equal(redirecionouPara, null);
});

test("erro 500 mostra o texto amigável, não o da API", async () => {
  simularResposta(500, { error: { code: "INTERNAL_ERROR", message: "boom" } });
  await assert.rejects(getAutenticado("/api/reservas"), (erro: unknown) => {
    assert.ok(erro instanceof ApiError);
    assert.match(erro.message, /do nosso lado/);
    return true;
  });
});

test("patchAutenticado usa PATCH, manda o corpo em JSON e o token", async () => {
  simularResposta(200, { data: { id: "b1", status: "MANUTENCAO" } });
  const resultado = await patchAutenticado<{ status: string }>("/api/admin/bicicletas/b1", {
    status: "MANUTENCAO",
  });
  assert.deepEqual(resultado, { id: "b1", status: "MANUTENCAO" });
  const { url, init } = chamadas[0];
  assert.equal(url, "/api/admin/bicicletas/b1");
  assert.equal(init.method, "PATCH");
  assert.equal(init.body, '{"status":"MANUTENCAO"}');
  const cabecalhos = init.headers as Record<string, string>;
  assert.equal(cabecalhos["Content-Type"], "application/json");
  assert.equal(cabecalhos.Authorization, "Bearer token-de-teste");
});

test("patchAutenticado sem token não manda Authorization", async () => {
  armazenamento.clear();
  simularResposta(200, { data: {} });
  await patchAutenticado("/api/admin/bicicletas/b1", { status: "DISPONIVEL" });
  assert.equal((chamadas[0].init.headers as Record<string, string>).Authorization, undefined);
});

test("patchAutenticado: 400 vira ApiError com os erros por campo", async () => {
  simularResposta(400, {
    error: {
      code: "VALIDATION_ERROR",
      message: "Dados inválidos.",
      details: { status: "Status inválido." },
    },
  });
  await assert.rejects(patchAutenticado("/api/admin/bicicletas/b1", { status: "X" }), (erro: unknown) => {
    assert.ok(erro instanceof ApiError);
    assert.equal(erro.code, "VALIDATION_ERROR");
    assert.deepEqual(erro.details, { status: "Status inválido." });
    return true;
  });
  assert.equal(redirecionouPara, null);
});

test("patchAutenticado: 403 (perfil errado) mostra o erro e mantém a sessão", async () => {
  simularResposta(403, { error: { code: "FORBIDDEN", message: "Sem permissão." } });
  await assert.rejects(patchAutenticado("/api/admin/bicicletas/b1", { status: "BAIXADA" }), ApiError);
  assert.equal(redirecionouPara, null);
  assert.equal(armazenamento.get("bik_token"), "token-de-teste");
});

test("patchAutenticado: 401 apaga a sessão e leva ao login", async () => {
  simularResposta(401, { error: { code: "UNAUTHORIZED", message: "Sessão inválida." } });
  await assert.rejects(patchAutenticado("/api/admin/bicicletas/b1", { status: "BAIXADA" }), ApiError);
  assert.equal(armazenamento.has("bik_token"), false);
  assert.ok(redirecionouPara?.includes("/login?next="));
});

test("404 sem corpo JSON (rota inexistente) guarda o status HTTP no ApiError", async () => {
  globais.fetch = async (url: string, init: RequestInit = {}) => {
    chamadas.push({ url, init });
    return new Response("<html>404</html>", { status: 404 });
  };
  await assert.rejects(getAutenticado("/api/nao-existe"), (erro: unknown) => {
    assert.ok(erro instanceof ApiError);
    assert.equal(erro.status, 404);
    assert.equal(erro.code, "UNKNOWN");
    return true;
  });
});
