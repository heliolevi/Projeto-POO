import { test } from "node:test";
import assert from "node:assert/strict";
import { ATIVIDADES as ATIVIDADES_DO_SERVIDOR } from "../dominio/ciclista.ts";
import { STATUS_BICICLETA as STATUS_BICICLETA_DO_SERVIDOR } from "@/modules/catalogo";
import {
  ATIVIDADES,
  ROTULO_ATIVIDADE,
  ROTULO_STATUS,
  STATUS_EDITAVEIS,
  pontosDasBicicletas,
  reaisParaCentavos,
  type BicicletaAdmin,
} from "./catalogo.ts";

test("reaisParaCentavos aceita vírgula, ponto e R$", () => {
  assert.equal(reaisParaCentavos("40"), 4000);
  assert.equal(reaisParaCentavos("40,5"), 4050);
  assert.equal(reaisParaCentavos("R$ 12,99"), 1299);
  assert.equal(reaisParaCentavos("0"), 0);
});

test("reaisParaCentavos recusa texto inválido", () => {
  for (const t of ["", "abc", "-1", "1,234", "1.2.3"]) assert.equal(reaisParaCentavos(t), null, t);
});

test("pontosDasBicicletas não repete o ponto", () => {
  const b = (id: string, ponto: string) =>
    ({ id, ponto: { id: ponto, nome: `Ponto ${ponto}` } }) as BicicletaAdmin;
  assert.deepEqual(pontosDasBicicletas([b("1", "a"), b("2", "a"), b("3", "c")]), [
    { id: "a", nome: "Ponto a" },
    { id: "c", nome: "Ponto c" },
  ]);
});

test("reaisParaCentavos não erra por ponto flutuante", () => {
  // 19.99 * 100 dá 1998.9999999999998 em ponto flutuante; o arredondamento corrige.
  assert.equal(reaisParaCentavos("19,99"), 1999);
  assert.equal(reaisParaCentavos("0,29"), 29);
  assert.equal(reaisParaCentavos("1.15"), 115);
  assert.equal(reaisParaCentavos("0,07"), 7);
});

test("reaisParaCentavos aceita zero, espaços nas pontas, R$ colado e minúsculo", () => {
  assert.equal(reaisParaCentavos("0,00"), 0);
  assert.equal(reaisParaCentavos("  10,5  "), 1050);
  assert.equal(reaisParaCentavos("R$12"), 1200);
  assert.equal(reaisParaCentavos("r$ 7"), 700);
  assert.equal(reaisParaCentavos("10.5"), 1050);
});

test("reaisParaCentavos recusa formatos ambíguos ou que a API não entende", () => {
  // separador de milhar, sinais, notação científica, partes vazias e dígitos que não são ASCII
  for (const t of ["1.234,56", "+5", "1e3", ".5", "5.", ",5", "5,", "10,", "NaN", "Infinity", "٣"]) {
    assert.equal(reaisParaCentavos(t), null, t);
  }
});

test("reaisParaCentavos devolve inteiro seguro mesmo para valores enormes (a API é quem recusa)", () => {
  const limiteDoBanco = 2_147_483_647; // coluna integer; CENTAVOS_MAX do módulo catalogo
  assert.equal(reaisParaCentavos("21474836,47"), limiteDoBanco);
  const acima = reaisParaCentavos("21474836,48");
  assert.ok(acima !== null && acima > limiteDoBanco);
  assert.ok(Number.isInteger(reaisParaCentavos("999999999")));
});

test("pontosDasBicicletas devolve lista vazia sem bicicletas", () => {
  assert.deepEqual(pontosDasBicicletas([]), []);
});

test("pontosDasBicicletas mantém a ordem da primeira aparição e o primeiro nome visto", () => {
  const b = (id: string, ponto: string, nome: string) =>
    ({ id, ponto: { id: ponto, nome } }) as BicicletaAdmin;
  assert.deepEqual(
    pontosDasBicicletas([b("1", "z", "Zeta"), b("2", "a", "Alfa"), b("3", "z", "Outro nome")]),
    [
      { id: "z", nome: "Zeta" },
      { id: "a", nome: "Alfa" },
    ],
  );
});

test("os rótulos cobrem todos os status e atividades (a tela nunca mostra undefined)", () => {
  for (const s of [...STATUS_EDITAVEIS, "ALUGADA" as const]) {
    assert.ok(ROTULO_STATUS[s], `sem rótulo para o status ${s}`);
  }
  for (const a of ATIVIDADES) assert.ok(ROTULO_ATIVIDADE[a], `sem rótulo para ${a}`);
  assert.equal(Object.keys(ROTULO_STATUS).length, STATUS_EDITAVEIS.length + 1);
  assert.equal(Object.keys(ROTULO_ATIVIDADE).length, ATIVIDADES.length);
});

// Estes valores espelham o servidor de propósito (o navegador não importa o módulo). Se o servidor
// mudar e este arquivo não, o painel passaria a mandar valores que a API recusa com 400.
test("ATIVIDADES do painel é igual ao domínio compartilhado", () => {
  assert.deepEqual([...ATIVIDADES], [...ATIVIDADES_DO_SERVIDOR]);
});

test("STATUS_EDITAVEIS do painel é igual ao que a API do catálogo aceita", () => {
  assert.deepEqual([...STATUS_EDITAVEIS], [...STATUS_BICICLETA_DO_SERVIDOR]);
});
