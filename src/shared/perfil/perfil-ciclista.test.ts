import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CompletudeDoPerfil,
  FormularioDePerfil,
  IniciaisDoNome,
} from "./perfil-ciclista.ts";

test("FormularioDePerfil.inicial preenche com o que a conta já tem e deixa vazio o que é null", () => {
  assert.deepEqual(
    FormularioDePerfil.inicial({ alturaCm: 172, experiencia: "INICIANTE", atividade: null }).dados,
    { altura: "172", experiencia: "INICIANTE", atividade: "" },
  );
  assert.deepEqual(FormularioDePerfil.inicial(undefined).dados, { altura: "", experiencia: "", atividade: "" });
});

test("FormularioDePerfil.validar aceita tudo vazio e valores dentro da faixa", () => {
  assert.deepEqual(new FormularioDePerfil({ altura: "", experiencia: "", atividade: "" }).validar(), {});
  assert.deepEqual(new FormularioDePerfil({ altura: "100", experiencia: "AVANCADO", atividade: "TRILHA" }).validar(), {});
  assert.deepEqual(new FormularioDePerfil({ altura: "250", experiencia: "", atividade: "" }).validar(), {});
});

test("FormularioDePerfil.validar recusa altura fora da faixa ou que não é número inteiro", () => {
  for (const altura of ["99", "251", "1,72", "172.5", "abc", "-170"]) {
    assert.ok(new FormularioDePerfil({ altura, experiencia: "", atividade: "" }).validar().altura, altura);
  }
});

test("FormularioDePerfil.validar recusa opções que não existem", () => {
  const erros = new FormularioDePerfil({ altura: "", experiencia: "EXPERT", atividade: "VOO" }).validar();
  assert.ok(erros.experiencia);
  assert.ok(erros.atividade);
});

test("FormularioDePerfil.corpo manda sempre as três chaves, com null no que está vazio", () => {
  assert.deepEqual(new FormularioDePerfil({ altura: " 172 ", experiencia: "INICIANTE", atividade: "" }).corpo(), {
    alturaCm: 172,
    experiencia: "INICIANTE",
    atividade: null,
  });
  assert.deepEqual(new FormularioDePerfil({ altura: "", experiencia: "", atividade: "" }).corpo(), {
    alturaCm: null,
    experiencia: null,
    atividade: null,
  });
});

test("CompletudeDoPerfil.estaCompleto só é verdadeiro com os três dados", () => {
  assert.equal(CompletudeDoPerfil.estaCompleto({ alturaCm: 172, experiencia: "INICIANTE", atividade: "PASSEIO" }), true);
  assert.equal(CompletudeDoPerfil.estaCompleto({ alturaCm: 172, experiencia: null, atividade: "PASSEIO" }), false);
  assert.equal(CompletudeDoPerfil.estaCompleto(undefined), false);
});

test("CompletudeDoPerfil só tem métodos estáticos: não se cria instância", () => {
  assert.throws(() => new (CompletudeDoPerfil as unknown as new () => unknown)(), /só tem métodos estáticos/);
});

test("FormularioDePerfil.errosDaApi troca alturaCm por altura e ignora campos desconhecidos", () => {
  assert.deepEqual(
    FormularioDePerfil.errosDaApi({ alturaCm: "a", experiencia: "b", atividade: "c", corpo: "d", outro: "x" }),
    { altura: "a", experiencia: "b", atividade: "c", corpo: "d" },
  );
  assert.deepEqual(FormularioDePerfil.errosDaApi({}), {
    altura: undefined,
    experiencia: undefined,
    atividade: undefined,
    corpo: undefined,
  });
});

test("IniciaisDoNome.de usa a primeira e a última palavra, em maiúsculas", () => {
  assert.equal(IniciaisDoNome.de("ana maria souza"), "AS");
  assert.equal(IniciaisDoNome.de("  joão  "), "J");
  assert.equal(IniciaisDoNome.de("   "), "?");
  assert.equal(IniciaisDoNome.de(""), "?");
  assert.throws(() => new (IniciaisDoNome as unknown as new () => unknown)(), /só tem métodos estáticos/);
});
