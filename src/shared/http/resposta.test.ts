import assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictError, NotFoundError, TooManyRequestsError, ValidationError } from "./errors.ts";
import { Resposta } from "./resposta.ts";

test("ok devolve 200 com { data } e aceita cabeçalhos, mas não deixa trocar o status", async () => {
  const r = Resposta.ok({ a: 1 }, { headers: { "Cache-Control": "no-store" }, status: 500 });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(await r.json(), { data: { a: 1 } });
});

test("criada devolve 201 e semConteudo devolve 204 sem corpo", async () => {
  const c = Resposta.criada({ id: "x" }, { status: 200 });
  assert.equal(c.status, 201);
  assert.deepEqual(await c.json(), { data: { id: "x" } });
  const s = Resposta.semConteudo();
  assert.equal(s.status, 204);
  assert.equal(await s.text(), "");
});

test("deErro mostra código, mensagem e status do erro conhecido, e os detalhes de validação", async () => {
  const r = Resposta.deErro(new ValidationError("Dados inválidos.", { email: "inválido" }));
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: { code: "VALIDATION_ERROR", message: "Dados inválidos.", details: { email: "inválido" } } });
  assert.equal(Resposta.deErro(new NotFoundError()).status, 404);
  assert.equal(Resposta.deErro(new ConflictError("já existe")).status, 409);
});

test("deErro não inclui details quando o erro não tem", async () => {
  const corpo = (await Resposta.deErro(new NotFoundError()).json()) as { error: Record<string, unknown> };
  assert.equal("details" in corpo.error, false);
});

test("deErro repassa o cabeçalho Retry-After do 429", () => {
  const r = Resposta.deErro(new TooManyRequestsError(42));
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("retry-after"), "42");
});

test("deErro com erro inesperado vira 500 genérico, sem vazar a mensagem", async () => {
  const antes = console.error;
  console.error = () => {};
  try {
    for (const erro of [new Error("senha do banco: abc123"), "texto", 42, null, undefined]) {
      const r = Resposta.deErro(erro);
      assert.equal(r.status, 500);
      const texto = JSON.stringify(await r.json());
      assert.equal(texto.includes("abc123"), false);
      assert.deepEqual(JSON.parse(texto), { error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor" } });
    }
  } finally {
    console.error = antes;
  }
});

test("a classe é só de fábricas: não dá para criar instância", () => {
  assert.throws(() => new (Resposta as unknown as new () => unknown)(), TypeError);
});
