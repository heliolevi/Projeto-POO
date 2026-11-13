import assert from "node:assert/strict";
import { test } from "node:test";
import { mensagemDoErro } from "./mensagens.ts";

test("troca as mensagens genéricas por textos amigáveis", () => {
  assert.match(mensagemDoErro(429, "TOO_MANY_REQUESTS", "x"), /Muitas tentativas/);
  assert.match(mensagemDoErro(502, "PAGAMENTO_INDISPONIVEL", "x"), /pagamento está indisponível/);
  assert.match(mensagemDoErro(413, "PAYLOAD_TOO_LARGE", "x"), /grandes demais/);
  assert.match(mensagemDoErro(500, "INTERNAL_ERROR", "x"), /do nosso lado/);
  assert.match(mensagemDoErro(503, "UNKNOWN", "x"), /do nosso lado/);
});

test("mantém a mensagem da API quando ela já é clara para a pessoa", () => {
  assert.equal(mensagemDoErro(400, "VALIDATION_ERROR", "Dados inválidos."), "Dados inválidos.");
  assert.equal(mensagemDoErro(401, "UNAUTHORIZED", "E-mail ou senha inválidos."), "E-mail ou senha inválidos.");
  assert.equal(mensagemDoErro(404, "NOT_FOUND", "Reserva não encontrada."), "Reserva não encontrada.");
  assert.equal(mensagemDoErro(409, "CONFLICT", "Reserva já paga."), "Reserva já paga.");
});
