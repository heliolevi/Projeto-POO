import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";
import { emitirToken, verificarToken } from "./token.ts";

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

const b64 = (dados: string | Buffer) => Buffer.from(dados).toString("base64url");

// Monta um token na mão, para testar casos que o emitirToken nunca produziria.
function montar(cabecalho: object, corpo: object, segredo = SEGREDO): string {
  const conteudo = `${b64(JSON.stringify(cabecalho))}.${b64(JSON.stringify(corpo))}`;
  const assinatura = createHmac("sha256", segredo).update(conteudo).digest();
  return `${conteudo}.${b64(assinatura)}`;
}
const agora = () => Math.floor(Date.now() / 1000);
const CAB = { alg: "HS256", typ: "JWT" };

test("um token emitido é aceito e traz o usuário e o perfil", () => {
  const { token } = emitirToken({ id: ID, perfil: "CLIENTE" });
  const sessao = verificarToken(token);
  assert.equal(sessao?.sub, ID);
  assert.equal(sessao?.perfil, "CLIENTE");
});

test("o token expira em 24 horas", () => {
  const { expiraEm } = emitirToken({ id: ID, perfil: "CLIENTE" });
  const horas = (expiraEm.getTime() - Date.now()) / 3_600_000;
  assert.ok(horas > 23.9 && horas <= 24);
});

test("token com o corpo adulterado é rejeitado", () => {
  const { token } = emitirToken({ id: ID, perfil: "CLIENTE" });
  const [cab, , assinatura] = token.split(".");
  const falso = b64(JSON.stringify({ sub: ID, perfil: "ADMIN_PLATAFORMA", iat: agora(), exp: agora() + 999 }));
  assert.equal(verificarToken(`${cab}.${falso}.${assinatura}`), null);
});

test("token assinado com outro segredo é rejeitado", () => {
  const token = montar(CAB, { sub: ID, perfil: "CLIENTE", iat: agora(), exp: agora() + 60 }, "outro-segredo-qualquer-com-32-caracteres!!");
  assert.equal(verificarToken(token), null);
});

test("token expirado é rejeitado", () => {
  const token = montar(CAB, { sub: ID, perfil: "CLIENTE", iat: agora() - 100, exp: agora() - 1 });
  assert.equal(verificarToken(token), null);
});

test('alg "none" sem assinatura é rejeitado', () => {
  const conteudo = `${b64(JSON.stringify({ alg: "none", typ: "JWT" }))}.${b64(JSON.stringify({ sub: ID, perfil: "ADMIN_PLATAFORMA", exp: agora() + 60 }))}`;
  assert.equal(verificarToken(`${conteudo}.`), null);
});

test('alg "none" mesmo com assinatura válida é rejeitado (o algoritmo é conferido)', () => {
  const token = montar({ alg: "none", typ: "JWT" }, { sub: ID, perfil: "CLIENTE", iat: agora(), exp: agora() + 60 });
  assert.equal(verificarToken(token), null);
});

test("token com o sub fora do formato é rejeitado", () => {
  const token = montar(CAB, { sub: 123, perfil: "CLIENTE", iat: agora(), exp: agora() + 60 });
  assert.equal(verificarToken(token), null);
});

test("lixo e partes faltando são rejeitados", () => {
  for (const ruim of ["", "abc", "a.b", "a.b.c.d", "...", "não.é.token"]) {
    assert.equal(verificarToken(ruim), null, ruim);
  }
});

test("segredo curto é recusado", () => {
  process.env.SESSION_SECRET = "curto";
  try {
    assert.throws(() => emitirToken({ id: ID, perfil: "CLIENTE" }), /32 caracteres/);
  } finally {
    process.env.SESSION_SECRET = SEGREDO;
  }
});

test("o segredo de exemplo do .env.example é recusado", () => {
  process.env.SESSION_SECRET = "troque-por-um-valor-aleatorio-com-pelo-menos-32-caracteres";
  try {
    assert.throws(() => emitirToken({ id: ID, perfil: "CLIENTE" }), /valor de exemplo/);
    assert.throws(() => verificarToken("a.b.c"), /valor de exemplo/);
  } finally {
    process.env.SESSION_SECRET = SEGREDO;
  }
});

test("sem SESSION_SECRET dá erro claro", () => {
  delete process.env.SESSION_SECRET;
  try {
    assert.throws(() => emitirToken({ id: ID, perfil: "CLIENTE" }), /SESSION_SECRET/);
  } finally {
    process.env.SESSION_SECRET = SEGREDO;
  }
});
