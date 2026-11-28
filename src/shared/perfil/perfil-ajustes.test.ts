import { test } from "node:test";
import assert from "node:assert/strict";
import { FormularioDePerfil } from "./perfil-ciclista.ts";

test("FormularioDePerfil.dadosInformados conta só os valores aceitos", () => {
  assert.equal(new FormularioDePerfil({ altura: "", experiencia: "", atividade: "" }).dadosInformados(), 0);
  assert.equal(new FormularioDePerfil({ altura: "172", experiencia: "", atividade: "" }).dadosInformados(), 1);
  assert.equal(new FormularioDePerfil({ altura: "172", experiencia: "INICIANTE", atividade: "TRILHA" }).dadosInformados(), 3);
});

test("FormularioDePerfil.dadosInformados ignora altura fora da faixa ou com texto, e opções desconhecidas", () => {
  assert.equal(new FormularioDePerfil({ altura: "99", experiencia: "X", atividade: "" }).dadosInformados(), 0);
  assert.equal(new FormularioDePerfil({ altura: "1,70", experiencia: "", atividade: "VOAR" }).dadosInformados(), 0);
  assert.equal(new FormularioDePerfil({ altura: " 180 ", experiencia: "", atividade: "" }).dadosInformados(), 1);
});

test("FormularioDePerfil.ajustarAltura soma e subtrai a partir do valor do campo", () => {
  assert.equal(FormularioDePerfil.ajustarAltura("172", 1), "173");
  assert.equal(FormularioDePerfil.ajustarAltura("172", -1), "171");
  assert.equal(FormularioDePerfil.ajustarAltura(" 172 ", 1), "173");
});

test("FormularioDePerfil.ajustarAltura com campo vazio ou inválido começa em 170 cm", () => {
  assert.equal(FormularioDePerfil.ajustarAltura("", 1), "170");
  assert.equal(FormularioDePerfil.ajustarAltura("", -1), "170");
  assert.equal(FormularioDePerfil.ajustarAltura("abc", 1), "170");
});

test("FormularioDePerfil.ajustarAltura não passa dos limites de 100 e 250 cm", () => {
  assert.equal(FormularioDePerfil.ajustarAltura("250", 1), "250");
  assert.equal(FormularioDePerfil.ajustarAltura("100", -1), "100");
  assert.equal(FormularioDePerfil.ajustarAltura("40", 1), "100");
  assert.equal(FormularioDePerfil.ajustarAltura("900", -1), "250");
});

// Os botões − e + chegam a disparar vários cliques antes de a tela redesenhar. Cada clique tem
// de somar sobre o valor MAIS RECENTE do campo, e não sobre o que a tela mostrava quando o
// botão foi desenhado (que perdia cliques: 20 toques rápidos davam +1).
test("FormularioDePerfil.com troca só o campo informado", () => {
  const antes = { altura: "172", experiencia: "INICIANTE", atividade: "PASSEIO" };
  const depois = new FormularioDePerfil(antes).com("atividade", "TRILHA").dados;
  assert.deepEqual(depois, { altura: "172", experiencia: "INICIANTE", atividade: "TRILHA" });
  assert.notEqual(depois, antes, "não altera o objeto de antes");
  assert.equal(antes.atividade, "PASSEIO");
});

test("FormularioDePerfil.com com função aplica sobre o valor mais recente: 20 cliques somam 20 cm", () => {
  let form = { altura: "172", experiencia: "", atividade: "" };
  for (let clique = 0; clique < 20; clique++) {
    form = new FormularioDePerfil(form).com("altura", (atual) => FormularioDePerfil.ajustarAltura(atual, 1)).dados;
  }
  assert.equal(form.altura, "192");
});

test("FormularioDePerfil.com com função respeita o limite mesmo em rajada", () => {
  let form = { altura: "248", experiencia: "", atividade: "" };
  for (let clique = 0; clique < 10; clique++) {
    form = new FormularioDePerfil(form).com("altura", (atual) => FormularioDePerfil.ajustarAltura(atual, 1)).dados;
  }
  assert.equal(form.altura, "250");
  for (let clique = 0; clique < 300; clique++) {
    form = new FormularioDePerfil(form).com("altura", (atual) => FormularioDePerfil.ajustarAltura(atual, -1)).dados;
  }
  assert.equal(form.altura, "100");
});

test("FormularioDePerfil.ajustarAltura: valor com zeros à esquerda ou com sinal não é número aceito", () => {
  assert.equal(FormularioDePerfil.ajustarAltura("-5", 1), "170");
  assert.equal(FormularioDePerfil.ajustarAltura("1e2", 1), "170");
  assert.equal(FormularioDePerfil.ajustarAltura("172.5", 1), "170");
});

test("FormularioDePerfil não expõe campos e é imutável", () => {
  const origem = { altura: "172", experiencia: "INICIANTE", atividade: "" };
  const form = new FormularioDePerfil(origem);
  assert.deepEqual(Object.keys(form), []);
  origem.altura = "999";
  assert.equal(form.dados.altura, "172");
  const copia = form.dados;
  copia.altura = "1";
  assert.equal(form.dados.altura, "172");
  const outro = form.com("altura", "180");
  assert.equal(form.dados.altura, "172");
  assert.equal(outro.dados.altura, "180");
  assert.notEqual(outro, form);
});
