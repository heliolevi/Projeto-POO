import assert from "node:assert/strict";
import { test } from "node:test";
import type { PerfilCiclista } from "./perfil.ts";
import {
  ajusteDeAltura,
  experienciaSuficiente,
  recomendar,
  type TipoCandidato,
} from "./recomendacao.ts";

// Os tipos do seed de desenvolvimento (db/seeds/dev.sql), com 2 unidades livres cada.
function tipo(parcial: Partial<TipoCandidato> & Pick<TipoCandidato, "id" | "nome">): TipoCandidato {
  return {
    descricao: null,
    atividades: ["PASSEIO"],
    alturaMinCm: 150,
    alturaMaxCm: 190,
    nivelRecomendado: "INICIANTE",
    precoHoraCentavos: 1000,
    precoDiaCentavos: 5000,
    valorCaucaoCentavos: 15000,
    ativo: true,
    unidadesLivres: 2,
    ...parcial,
  };
}

const URBANA = tipo({ id: "t-urbana", nome: "Urbana", atividades: ["URBANO", "PASSEIO"], alturaMinCm: 150, alturaMaxCm: 195, precoHoraCentavos: 1000, precoDiaCentavos: 5000 });
const PASSEIO = tipo({ id: "t-passeio", nome: "Passeio", atividades: ["PASSEIO", "TURISMO"], alturaMinCm: 145, alturaMaxCm: 190, precoHoraCentavos: 1200, precoDiaCentavos: 6000 });
const MTB = tipo({ id: "t-mtb", nome: "Mountain bike", atividades: ["TRILHA", "ESPORTE"], alturaMinCm: 160, alturaMaxCm: 200, nivelRecomendado: "INTERMEDIARIO", precoHoraCentavos: 2000, precoDiaCentavos: 10000, valorCaucaoCentavos: 30000 });
const SPEED = tipo({ id: "t-speed", nome: "Speed", atividades: ["ESPORTE", "URBANO"], alturaMinCm: 165, alturaMaxCm: 200, nivelRecomendado: "AVANCADO", precoHoraCentavos: 2500, precoDiaCentavos: 12000, valorCaucaoCentavos: 40000 });
const ELETRICA = tipo({ id: "t-eletrica", nome: "Elétrica", atividades: ["TURISMO", "URBANO", "PASSEIO"], alturaMinCm: 150, alturaMaxCm: 200, precoHoraCentavos: 3500, precoDiaCentavos: 18000, valorCaucaoCentavos: 60000 });
const INFANTIL = tipo({ id: "t-infantil", nome: "Infantil", atividades: ["PASSEIO"], alturaMinCm: 100, alturaMaxCm: 140, precoHoraCentavos: 800, precoDiaCentavos: 4000, valorCaucaoCentavos: 10000 });
const CATALOGO = [URBANA, PASSEIO, MTB, SPEED, ELETRICA, INFANTIL];

const perfil = (p: Partial<PerfilCiclista> = {}): PerfilCiclista => ({
  alturaCm: null,
  experiencia: null,
  atividade: null,
  ...p,
});

test("ajusteDeAltura vale 1 no centro da faixa e 0 nas pontas", () => {
  const faixa = { alturaMinCm: 150, alturaMaxCm: 190 };
  assert.equal(ajusteDeAltura(170, faixa), 1);
  assert.equal(ajusteDeAltura(150, faixa), 0);
  assert.equal(ajusteDeAltura(190, faixa), 0);
  assert.equal(ajusteDeAltura(160, faixa), 0.5);
  assert.equal(ajusteDeAltura(180, faixa), 0.5);
  assert.equal(ajusteDeAltura(149, faixa), 0, "fora da faixa");
  assert.equal(ajusteDeAltura(170, { alturaMinCm: 170, alturaMaxCm: 170 }), 1, "faixa de um valor só");
});

test("experienciaSuficiente compara os níveis em ordem", () => {
  assert.equal(experienciaSuficiente("INICIANTE", "INICIANTE"), true);
  assert.equal(experienciaSuficiente("AVANCADO", "INTERMEDIARIO"), true);
  assert.equal(experienciaSuficiente("INICIANTE", "INTERMEDIARIO"), false);
  assert.equal(experienciaSuficiente("INTERMEDIARIO", "AVANCADO"), false);
});

test("exemplo do contrato: 172 cm, iniciante, passeio, 4 horas", () => {
  const r = recomendar(perfil({ alturaCm: 172, experiencia: "INICIANTE", atividade: "PASSEIO" }), CATALOGO, 4);
  const passeio = r.find((x) => x.tipoId === PASSEIO.id);
  assert.ok(passeio);
  // altura: centro 167,5 e meia faixa 22,5 → 1 - 4,5/22,5 = 0,8 → 40; passeio 30; nível 20
  assert.equal(passeio.pontos, 90);
  assert.equal(passeio.valorAluguelCentavos, 4800);
  assert.equal(passeio.valorCaucaoCentavos, 15000);
  assert.equal(passeio.unidadesLivres, 2);
  assert.deepEqual(passeio.motivos, [
    "Cabe bem na sua altura de 172 cm",
    "Boa para passeio",
    "Adequada ao seu nível (iniciante)",
  ]);
});

test("a lista sai ordenada por pontos, do maior para o menor", () => {
  const r = recomendar(perfil({ alturaCm: 172, experiencia: "INICIANTE", atividade: "PASSEIO" }), CATALOGO, 4);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].pontos >= r[i].pontos);
  // quem pedalaria passeio como iniciante não deve ver a Speed (só esporte e urbano, avançado) na frente
  assert.equal(r.at(-1)?.tipoId, SPEED.id);
});

test("tipos em que o cliente não cabe saem da lista", () => {
  const adulto = recomendar(perfil({ alturaCm: 180 }), CATALOGO, 2).map((x) => x.tipoId);
  assert.ok(!adulto.includes(INFANTIL.id));
  const crianca = recomendar(perfil({ alturaCm: 130 }), CATALOGO, 2).map((x) => x.tipoId);
  assert.deepEqual(crianca, [INFANTIL.id]);
});

test("sem altura informada, nenhum tipo sai por altura e ninguém ganha os pontos de altura", () => {
  const r = recomendar(perfil(), CATALOGO, 2);
  assert.equal(r.length, CATALOGO.length);
  assert.ok(r.every((x) => x.pontos === 0));
  assert.ok(r.every((x) => x.motivos.length === 0));
});

test("tipos inativos ou sem unidade livre não aparecem", () => {
  const tipos = [
    { ...URBANA, ativo: false },
    { ...PASSEIO, unidadesLivres: 0 },
    MTB,
  ];
  assert.deepEqual(
    recomendar(perfil({ alturaCm: 175 }), tipos, 2).map((x) => x.tipoId),
    [MTB.id],
  );
});

test("nenhuma bicicleta livre devolve lista vazia, não erro", () => {
  const esgotado = CATALOGO.map((t) => ({ ...t, unidadesLivres: 0 }));
  assert.deepEqual(recomendar(perfil({ alturaCm: 172 }), esgotado, 4), []);
  assert.deepEqual(recomendar(perfil({ alturaCm: 172 }), [], 4), []);
});

test("empate em pontos é desfeito pelo menor preço por dia e depois pelo nome", () => {
  const a = tipo({ id: "a", nome: "Bravo", precoDiaCentavos: 7000 });
  const b = tipo({ id: "b", nome: "Alfa", precoDiaCentavos: 7000 });
  const c = tipo({ id: "c", nome: "Charlie", precoDiaCentavos: 3000 });
  const r = recomendar(perfil({ atividade: "PASSEIO" }), [a, b, c], 2);
  assert.deepEqual(r.map((x) => x.pontos), [30, 30, 30]);
  assert.deepEqual(r.map((x) => x.nome), ["Charlie", "Alfa", "Bravo"]);
});

test("a atividade pesa 30 pontos e explica quando o tipo não é indicado", () => {
  const r = recomendar(perfil({ atividade: "TRILHA" }), [URBANA, MTB], 2);
  assert.deepEqual(r.map((x) => [x.tipoId, x.pontos]), [[MTB.id, 30], [URBANA.id, 0]]);
  assert.deepEqual(r[1].motivos, ["Não é a mais indicada para trilha"]);
});

test("a experiência pesa 20 pontos e explica o nível exigido", () => {
  const iniciante = recomendar(perfil({ experiencia: "INICIANTE" }), [MTB], 2)[0];
  assert.equal(iniciante.pontos, 0);
  assert.deepEqual(iniciante.motivos, ["Recomendada a partir do nível intermediário"]);
  const avancado = recomendar(perfil({ experiencia: "AVANCADO" }), [MTB], 2)[0];
  assert.equal(avancado.pontos, 20);
  assert.deepEqual(avancado.motivos, ["Adequada ao seu nível (avançado)"]);
});

test("na ponta da faixa o motivo avisa que a altura está no limite", () => {
  const r = recomendar(perfil({ alturaCm: 195 }), [URBANA], 2)[0];
  assert.equal(r.pontos, 0);
  assert.deepEqual(r.motivos, ["Cabe na sua altura de 195 cm, perto do limite da faixa (150 a 195 cm)"]);
});

test("os pontos ficam sempre entre 0 e 100 e são inteiros", () => {
  for (let altura = 100; altura <= 250; altura += 7) {
    for (const experiencia of ["INICIANTE", "INTERMEDIARIO", "AVANCADO", null] as const) {
      for (const atividade of ["PASSEIO", "TRILHA", "ESPORTE", null] as const) {
        for (const r of recomendar(perfil({ alturaCm: altura, experiencia, atividade }), CATALOGO, 3)) {
          assert.ok(Number.isInteger(r.pontos) && r.pontos >= 0 && r.pontos <= 100, `${r.pontos}`);
        }
      }
    }
  }
  const perfeito = recomendar(
    perfil({ alturaCm: 175, experiencia: "AVANCADO", atividade: "TRILHA" }),
    [tipo({ id: "x", nome: "X", atividades: ["TRILHA"], alturaMinCm: 150, alturaMaxCm: 200 })],
    1,
  )[0];
  assert.equal(perfeito.pontos, 100);
});

test("não altera a lista de tipos recebida", () => {
  const tipos = [SPEED, URBANA, PASSEIO];
  const copia = structuredClone(tipos);
  recomendar(perfil({ alturaCm: 172, atividade: "PASSEIO" }), tipos, 4);
  assert.deepEqual(tipos, copia);
});
