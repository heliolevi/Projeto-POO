import assert from "node:assert/strict";
import { test } from "node:test";
import { TradutorDeErros } from "./tradutor-de-erros.ts";

const t = new TradutorDeErros();

test("troca as mensagens genéricas por textos amigáveis", () => {
  assert.match(t.traduzir(429, "TOO_MANY_REQUESTS", "x"), /Muitas tentativas/);
  assert.match(t.traduzir(502, "PAGAMENTO_INDISPONIVEL", "x"), /pagamento está indisponível/);
  assert.match(t.traduzir(413, "PAYLOAD_TOO_LARGE", "x"), /grandes demais/);
  assert.match(t.traduzir(500, "INTERNAL_ERROR", "x"), /do nosso lado/);
  assert.match(t.traduzir(503, "UNKNOWN", "x"), /do nosso lado/);
});

test("mantém a mensagem da API quando ela já é clara para a pessoa", () => {
  assert.equal(t.traduzir(400, "VALIDATION_ERROR", "Dados inválidos."), "Dados inválidos.");
  assert.equal(t.traduzir(401, "UNAUTHORIZED", "E-mail ou senha inválidos."), "E-mail ou senha inválidos.");
  assert.equal(t.traduzir(404, "NOT_FOUND", "Reserva não encontrada."), "Reserva não encontrada.");
  assert.equal(t.traduzir(409, "CONFLICT", "Reserva já paga."), "Reserva já paga.");
});

test("o código vale mesmo com o status esperado trocado (429 por código, 500 por código)", () => {
  assert.match(t.traduzir(400, "TOO_MANY_REQUESTS", "x"), /Muitas tentativas/);
  assert.match(t.traduzir(400, "INTERNAL_ERROR", "x"), /do nosso lado/);
});

test("a mensagem de falta de conexão é uma constante da classe", () => {
  assert.match(TradutorDeErros.MENSAGEM_SEM_CONEXAO, /Sem conexão/);
});
