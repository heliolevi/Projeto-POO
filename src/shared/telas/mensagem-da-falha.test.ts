import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "../http/api-cliente.ts";
import { MensagemDaFalha } from "./mensagem-da-falha.ts";

test("MensagemDaFalha.de usa a mensagem da API quando o erro veio dela", () => {
  const erro = new ApiError("CONFLICT", "Horário indisponível.", undefined, 409);
  assert.equal(MensagemDaFalha.de(erro, "padrão"), "Horário indisponível.");
});

test("MensagemDaFalha.de cai no texto padrão para qualquer outra falha", () => {
  assert.equal(MensagemDaFalha.de(new Error("rede"), "padrão"), "padrão");
  assert.equal(MensagemDaFalha.de("texto", "padrão"), "padrão");
  assert.equal(MensagemDaFalha.de(null, "padrão"), "padrão");
  assert.equal(MensagemDaFalha.de(undefined, "padrão"), "padrão");
});

test("MensagemDaFalha só tem métodos estáticos: não se cria instância", () => {
  assert.throws(() => new (MensagemDaFalha as unknown as new () => unknown)(), /só tem métodos estáticos/);
});
