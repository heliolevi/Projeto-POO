import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from "./errors.ts";

test("AppError guarda code, message e status, e é uma instância de Error", () => {
  const error = new AppError("ALGO_ERRADO", "mensagem", 418);

  assert.ok(error instanceof Error);
  assert.equal(error.code, "ALGO_ERRADO");
  assert.equal(error.message, "mensagem");
  assert.equal(error.status, 418);
  assert.equal(error.name, "AppError");
});

test("ValidationError usa code VALIDATION_ERROR e status 400", () => {
  const error = new ValidationError("campo obrigatório");

  assert.ok(error instanceof AppError);
  assert.equal(error.code, "VALIDATION_ERROR");
  assert.equal(error.status, 400);
  assert.equal(error.message, "campo obrigatório");
});

test("UnauthorizedError usa code UNAUTHORIZED, status 401 e mensagem padrão", () => {
  const error = new UnauthorizedError();

  assert.equal(error.code, "UNAUTHORIZED");
  assert.equal(error.status, 401);
  assert.equal(error.message, "Não autenticado");
});

test("UnauthorizedError aceita mensagem customizada", () => {
  const error = new UnauthorizedError("token expirado");

  assert.equal(error.message, "token expirado");
});

test("ForbiddenError usa code FORBIDDEN, status 403 e mensagem padrão", () => {
  const error = new ForbiddenError();

  assert.equal(error.code, "FORBIDDEN");
  assert.equal(error.status, 403);
  assert.equal(error.message, "Acesso negado");
});

test("NotFoundError usa code NOT_FOUND, status 404 e mensagem padrão", () => {
  const error = new NotFoundError();

  assert.equal(error.code, "NOT_FOUND");
  assert.equal(error.status, 404);
  assert.equal(error.message, "Recurso não encontrado");
});

test("ConflictError usa code CONFLICT e status 409", () => {
  const error = new ConflictError("bicicleta já reservada no período");

  assert.equal(error.code, "CONFLICT");
  assert.equal(error.status, 409);
  assert.equal(error.message, "bicicleta já reservada no período");
});
