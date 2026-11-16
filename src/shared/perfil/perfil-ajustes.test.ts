import { test } from "node:test";
import assert from "node:assert/strict";
import { ajustarAltura, atualizarCampo, dadosInformados } from "./perfil-ciclista.ts";

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

// Os botões − e + chegam a disparar vários cliques antes de a tela redesenhar. Cada clique tem
// de somar sobre o valor MAIS RECENTE do campo, e não sobre o que a tela mostrava quando o
// botão foi desenhado (que perdia cliques: 20 toques rápidos davam +1).
test("atualizarCampo troca só o campo informado", () => {
  const antes = { altura: "172", experiencia: "INICIANTE", atividade: "PASSEIO" };
  const depois = atualizarCampo(antes, "atividade", "TRILHA");
  assert.deepEqual(depois, { altura: "172", experiencia: "INICIANTE", atividade: "TRILHA" });
  assert.notEqual(depois, antes, "não altera o objeto de antes");
  assert.equal(antes.atividade, "PASSEIO");
});

test("atualizarCampo com função aplica sobre o valor mais recente: 20 cliques somam 20 cm", () => {
  let form = { altura: "172", experiencia: "", atividade: "" };
  for (let clique = 0; clique < 20; clique++) {
    form = atualizarCampo(form, "altura", (atual) => ajustarAltura(atual, 1));
  }
  assert.equal(form.altura, "192");
});

test("atualizarCampo com função respeita o limite mesmo em rajada", () => {
  let form = { altura: "248", experiencia: "", atividade: "" };
  for (let clique = 0; clique < 10; clique++) {
    form = atualizarCampo(form, "altura", (atual) => ajustarAltura(atual, 1));
  }
  assert.equal(form.altura, "250");
  for (let clique = 0; clique < 300; clique++) {
    form = atualizarCampo(form, "altura", (atual) => ajustarAltura(atual, -1));
  }
  assert.equal(form.altura, "100");
});

test("ajustarAltura: valor com zeros à esquerda ou com sinal não é número aceito", () => {
  assert.equal(ajustarAltura("-5", 1), "170");
  assert.equal(ajustarAltura("1e2", 1), "170");
  assert.equal(ajustarAltura("172.5", 1), "170");
});
