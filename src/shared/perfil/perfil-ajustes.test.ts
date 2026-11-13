import { test } from "node:test";
import assert from "node:assert/strict";
import { ajustarAltura, dadosInformados } from "./perfil-ciclista.ts";

test("dadosInformados conta só os valores aceitos", () => {
  assert.equal(dadosInformados({ altura: "", experiencia: "", atividade: "" }), 0);
  assert.equal(dadosInformados({ altura: "172", experiencia: "", atividade: "" }), 1);
  assert.equal(dadosInformados({ altura: "172", experiencia: "INICIANTE", atividade: "TRILHA" }), 3);
});

test("dadosInformados ignora altura fora da faixa ou com texto, e opções desconhecidas", () => {
  assert.equal(dadosInformados({ altura: "99", experiencia: "X", atividade: "" }), 0);
  assert.equal(dadosInformados({ altura: "1,70", experiencia: "", atividade: "VOAR" }), 0);
  assert.equal(dadosInformados({ altura: " 180 ", experiencia: "", atividade: "" }), 1);
});

test("ajustarAltura soma e subtrai a partir do valor do campo", () => {
  assert.equal(ajustarAltura("172", 1), "173");
  assert.equal(ajustarAltura("172", -1), "171");
  assert.equal(ajustarAltura(" 172 ", 1), "173");
});

test("ajustarAltura com campo vazio ou inválido começa em 170 cm", () => {
  assert.equal(ajustarAltura("", 1), "170");
  assert.equal(ajustarAltura("", -1), "170");
  assert.equal(ajustarAltura("abc", 1), "170");
});

test("ajustarAltura não passa dos limites de 100 e 250 cm", () => {
  assert.equal(ajustarAltura("250", 1), "250");
  assert.equal(ajustarAltura("100", -1), "100");
  assert.equal(ajustarAltura("40", 1), "100");
  assert.equal(ajustarAltura("900", -1), "250");
});
