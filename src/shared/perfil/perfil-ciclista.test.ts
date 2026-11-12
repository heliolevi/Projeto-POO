import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formularioInicial,
  montarCorpo,
  perfilCompleto,
  validarPerfil,
} from "./perfil-ciclista.ts";

test("formularioInicial preenche com o que a conta já tem e deixa vazio o que é null", () => {
  assert.deepEqual(
    formularioInicial({ alturaCm: 172, experiencia: "INICIANTE", atividade: null }),
    { altura: "172", experiencia: "INICIANTE", atividade: "" },
  );
  assert.deepEqual(formularioInicial(undefined), { altura: "", experiencia: "", atividade: "" });
});

test("validarPerfil aceita tudo vazio e valores dentro da faixa", () => {
  assert.deepEqual(validarPerfil({ altura: "", experiencia: "", atividade: "" }), {});
  assert.deepEqual(validarPerfil({ altura: "100", experiencia: "AVANCADO", atividade: "TRILHA" }), {});
  assert.deepEqual(validarPerfil({ altura: "250", experiencia: "", atividade: "" }), {});
});

test("validarPerfil recusa altura fora da faixa ou que não é número inteiro", () => {
  for (const altura of ["99", "251", "1,72", "172.5", "abc", "-170"]) {
    assert.ok(validarPerfil({ altura, experiencia: "", atividade: "" }).altura, altura);
  }
});

test("validarPerfil recusa opções que não existem", () => {
  const erros = validarPerfil({ altura: "", experiencia: "EXPERT", atividade: "VOO" });
  assert.ok(erros.experiencia);
  assert.ok(erros.atividade);
});

test("montarCorpo manda sempre as três chaves, com null no que está vazio", () => {
  assert.deepEqual(montarCorpo({ altura: " 172 ", experiencia: "INICIANTE", atividade: "" }), {
    alturaCm: 172,
    experiencia: "INICIANTE",
    atividade: null,
  });
  assert.deepEqual(montarCorpo({ altura: "", experiencia: "", atividade: "" }), {
    alturaCm: null,
    experiencia: null,
    atividade: null,
  });
});

test("perfilCompleto só é verdadeiro com os três dados", () => {
  assert.equal(perfilCompleto({ alturaCm: 172, experiencia: "INICIANTE", atividade: "PASSEIO" }), true);
  assert.equal(perfilCompleto({ alturaCm: 172, experiencia: null, atividade: "PASSEIO" }), false);
  assert.equal(perfilCompleto(undefined), false);
});
