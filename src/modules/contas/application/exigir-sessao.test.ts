import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";
import { ForbiddenError, UnauthorizedError } from "../../../shared/http/errors.ts";
import { emitirToken } from "../infrastructure/token.ts";
import { criarExigirSessao, exigirPerfil, extrairBearer } from "./exigir-sessao.ts";

const SEGREDO = "segredo-de-teste-com-mais-de-32-caracteres-ok";
const ID = "3f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6f";

let anterior: string | undefined;
before(() => {
  anterior = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SEGREDO;
});
after(() => {
  if (anterior === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = anterior;
});

const requisicao = (authorization?: string) =>
  new Request("http://localhost/api/qualquer", {
    headers: authorization ? { authorization } : {},
  });

// O banco "de mentira": devolve o que o teste combinar e conta quantas vezes foi consultado.
function banco(situacao: { perfil: "CLIENTE" | "OPERADOR" | "ADMIN"; ativo: boolean } | null) {
  const consultas: string[] = [];
  return {
    consultas,
    buscar: async (id: string) => {
      consultas.push(id);
      return situacao;
    },
  };
}

test("extrairBearer aceita só o formato Bearer <token>", () => {
  assert.equal(extrairBearer("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(extrairBearer("bearer abc"), "abc");
  assert.equal(extrairBearer("Basic abc"), null);
  assert.equal(extrairBearer("Bearer"), null);
  assert.equal(extrairBearer("Bearer a b"), null);
  assert.equal(extrairBearer(""), null);
  assert.equal(extrairBearer(null), null);
});

test("sem header Authorization: 401", async () => {
  const db = banco({ perfil: "CLIENTE", ativo: true });
  await assert.rejects(criarExigirSessao(db.buscar)(requisicao()), UnauthorizedError);
  assert.equal(db.consultas.length, 0, "não deve consultar o banco");
});

test("token inválido: 401, sem consultar o banco", async () => {
  const db = banco({ perfil: "CLIENTE", ativo: true });
  await assert.rejects(criarExigirSessao(db.buscar)(requisicao("Bearer lixo.lixo.lixo")), UnauthorizedError);
  assert.equal(db.consultas.length, 0);
});

test("token válido de conta ativa: devolve o usuário", async () => {
  const db = banco({ perfil: "CLIENTE", ativo: true });
  const { token } = emitirToken({ id: ID, perfil: "CLIENTE" });
  const sessao = await criarExigirSessao(db.buscar)(requisicao(`Bearer ${token}`));
  assert.deepEqual(sessao, { usuarioId: ID, perfil: "CLIENTE" });
  assert.deepEqual(db.consultas, [ID]);
});

test("conta desativada perde o acesso mesmo com token válido", async () => {
  const db = banco({ perfil: "CLIENTE", ativo: false });
  const { token } = emitirToken({ id: ID, perfil: "CLIENTE" });
  await assert.rejects(criarExigirSessao(db.buscar)(requisicao(`Bearer ${token}`)), UnauthorizedError);
});

test("usuário que não existe mais: 401", async () => {
  const db = banco(null);
  const { token } = emitirToken({ id: ID, perfil: "CLIENTE" });
  await assert.rejects(criarExigirSessao(db.buscar)(requisicao(`Bearer ${token}`)), UnauthorizedError);
});

test("o perfil devolvido é o do banco, não o do token", async () => {
  const db = banco({ perfil: "OPERADOR", ativo: true });
  const { token } = emitirToken({ id: ID, perfil: "CLIENTE" }); // token antigo, perfil mudou depois
  const sessao = await criarExigirSessao(db.buscar)(requisicao(`Bearer ${token}`));
  assert.equal(sessao.perfil, "OPERADOR");
});

test("token assinado com sub que não é UUID não chega ao banco", async () => {
  const b64 = (d: string | Buffer) => Buffer.from(d).toString("base64url");
  const agora = Math.floor(Date.now() / 1000);
  const conteudo = `${b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64(
    JSON.stringify({ sub: "1; DROP TABLE usuario", perfil: "CLIENTE", iat: agora, exp: agora + 60 }),
  )}`;
  const token = `${conteudo}.${b64(createHmac("sha256", SEGREDO).update(conteudo).digest())}`;
  const db = banco({ perfil: "CLIENTE", ativo: true });
  await assert.rejects(criarExigirSessao(db.buscar)(requisicao(`Bearer ${token}`)), UnauthorizedError);
  assert.equal(db.consultas.length, 0);
});

test("perfil que não existe mais no modelo (vindo do banco) não ganha acesso", async () => {
  const situacao = { perfil: "GERENTE_LOCADORA", ativo: true };
  // @ts-expect-error: simula o banco devolvendo um perfil fora da lista
  const exigir = criarExigirSessao(async () => situacao);
  const { token } = emitirToken({ id: ID, perfil: "CLIENTE" });
  await assert.rejects(exigir(requisicao(`Bearer ${token}`)), UnauthorizedError);
});

test("exigirPerfil deixa passar os perfis permitidos e devolve a mesma sessão", () => {
  const sessao = { usuarioId: ID, perfil: "OPERADOR" as const };
  assert.equal(exigirPerfil(sessao, "OPERADOR", "ADMIN"), sessao);
  assert.equal(exigirPerfil({ usuarioId: ID, perfil: "ADMIN" }, "OPERADOR", "ADMIN").perfil, "ADMIN");
  assert.equal(exigirPerfil({ usuarioId: ID, perfil: "CLIENTE" }, "CLIENTE").perfil, "CLIENTE");
});

test("exigirPerfil responde 403 para perfil sem acesso", () => {
  const casos = [
    [{ usuarioId: ID, perfil: "CLIENTE" }, ["OPERADOR", "ADMIN"]],
    [{ usuarioId: ID, perfil: "OPERADOR" }, ["ADMIN"]],
    [{ usuarioId: ID, perfil: "ADMIN" }, ["CLIENTE"]],
  ] as const;
  for (const [sessao, permitidos] of casos) {
    assert.throws(
      () => exigirPerfil(sessao, ...(permitidos as unknown as ["CLIENTE"])),
      (erro: unknown) => {
        assert.ok(erro instanceof ForbiddenError);
        assert.equal(erro.status, 403);
        assert.equal(erro.code, "FORBIDDEN");
        return true;
      },
      `${sessao.perfil} em ${permitidos.join(",")}`,
    );
  }
});

test("sem sessão válida é 401 antes de olhar o perfil (ordem do contrato)", async () => {
  const db = banco({ perfil: "OPERADOR", ativo: true });
  const exigir = criarExigirSessao(db.buscar);
  await assert.rejects(
    (async () => exigirPerfil(await exigir(requisicao()), "CLIENTE"))(),
    UnauthorizedError,
  );
  const { token } = emitirToken({ id: ID, perfil: "OPERADOR" });
  await assert.rejects(
    (async () => exigirPerfil(await exigir(requisicao(`Bearer ${token}`)), "CLIENTE"))(),
    ForbiddenError,
  );
});
