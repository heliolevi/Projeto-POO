import { test } from "node:test";
import assert from "node:assert/strict";
import { ATIVIDADES as ATIVIDADES_DO_SERVIDOR } from "../dominio/ciclista.ts";
import { STATUS_BICICLETA as STATUS_BICICLETA_DO_SERVIDOR } from "@/modules/catalogo";
import {
  ATIVIDADES,
  STATUS_EDITAVEIS,
  PontosDasBicicletas,
  RotulosDoCatalogo,
  ConversorDeReais,
  type BicicletaAdmin,
} from "./catalogo.ts";

test("ConversorDeReais.paraCentavos aceita vírgula, ponto e R$", () => {
  assert.equal(ConversorDeReais.paraCentavos("40"), 4000);
  assert.equal(ConversorDeReais.paraCentavos("40,5"), 4050);
  assert.equal(ConversorDeReais.paraCentavos("R$ 12,99"), 1299);
  assert.equal(ConversorDeReais.paraCentavos("0"), 0);
});

test("ConversorDeReais.paraCentavos recusa texto inválido", () => {
  for (const t of ["", "abc", "-1", "1,234", "1.2.3"]) assert.equal(ConversorDeReais.paraCentavos(t), null, t);
});

test("PontosDasBicicletas.distintos não repete o ponto", () => {
  const b = (id: string, ponto: string) =>
    ({ id, ponto: { id: ponto, nome: `Ponto ${ponto}` } }) as BicicletaAdmin;
  assert.deepEqual(PontosDasBicicletas.distintos([b("1", "a"), b("2", "a"), b("3", "c")]), [
    { id: "a", nome: "Ponto a" },
    { id: "c", nome: "Ponto c" },
  ]);
});

test("ConversorDeReais.paraCentavos não erra por ponto flutuante", () => {
  // 19.99 * 100 dá 1998.9999999999998 em ponto flutuante; o arredondamento corrige.
  assert.equal(ConversorDeReais.paraCentavos("19,99"), 1999);
  assert.equal(ConversorDeReais.paraCentavos("0,29"), 29);
  assert.equal(ConversorDeReais.paraCentavos("1.15"), 115);
  assert.equal(ConversorDeReais.paraCentavos("0,07"), 7);
});

test("ConversorDeReais.paraCentavos aceita zero, espaços nas pontas, R$ colado e minúsculo", () => {
  assert.equal(ConversorDeReais.paraCentavos("0,00"), 0);
  assert.equal(ConversorDeReais.paraCentavos("  10,5  "), 1050);
  assert.equal(ConversorDeReais.paraCentavos("R$12"), 1200);
  assert.equal(ConversorDeReais.paraCentavos("r$ 7"), 700);
  assert.equal(ConversorDeReais.paraCentavos("10.5"), 1050);
});

test("ConversorDeReais.paraCentavos recusa formatos ambíguos ou que a API não entende", () => {
  // separador de milhar, sinais, notação científica, partes vazias e dígitos que não são ASCII
  for (const t of ["1.234,56", "+5", "1e3", ".5", "5.", ",5", "5,", "10,", "NaN", "Infinity", "٣"]) {
    assert.equal(ConversorDeReais.paraCentavos(t), null, t);
  }
});

test("ConversorDeReais.paraCentavos devolve inteiro seguro mesmo para valores enormes (a API é quem recusa)", () => {
  const limiteDoBanco = 2_147_483_647; // coluna integer; CENTAVOS_MAX do módulo catalogo
  assert.equal(ConversorDeReais.paraCentavos("21474836,47"), limiteDoBanco);
  const acima = ConversorDeReais.paraCentavos("21474836,48");
  assert.ok(acima !== null && acima > limiteDoBanco);
  assert.ok(Number.isInteger(ConversorDeReais.paraCentavos("999999999")));
});

test("PontosDasBicicletas.distintos devolve lista vazia sem bicicletas", () => {
  assert.deepEqual(PontosDasBicicletas.distintos([]), []);
});

test("PontosDasBicicletas.distintos mantém a ordem da primeira aparição e o primeiro nome visto", () => {
  const b = (id: string, ponto: string, nome: string) =>
    ({ id, ponto: { id: ponto, nome } }) as BicicletaAdmin;
  assert.deepEqual(
    PontosDasBicicletas.distintos([b("1", "z", "Zeta"), b("2", "a", "Alfa"), b("3", "z", "Outro nome")]),
    [
      { id: "z", nome: "Zeta" },
      { id: "a", nome: "Alfa" },
    ],
  );
});

test("os rótulos cobrem todos os status e atividades (a tela nunca mostra undefined)", () => {
  for (const s of [...STATUS_EDITAVEIS, "ALUGADA" as const]) {
    assert.ok(RotulosDoCatalogo.status(s), `sem rótulo para o status ${s}`);
  }
  for (const a of ATIVIDADES) assert.ok(RotulosDoCatalogo.atividade(a), `sem rótulo para ${a}`);
});

// Estes valores espelham o servidor de propósito (o navegador não importa o módulo). Se o servidor
// mudar e este arquivo não, o painel passaria a mandar valores que a API recusa com 400.
test("ATIVIDADES do painel é igual ao domínio compartilhado", () => {
  assert.deepEqual([...ATIVIDADES], [...ATIVIDADES_DO_SERVIDOR]);
});

test("STATUS_EDITAVEIS do painel é igual ao que a API do catálogo aceita", () => {
  assert.deepEqual([...STATUS_EDITAVEIS], [...STATUS_BICICLETA_DO_SERVIDOR]);
});

test("RotulosDoCatalogo devolve o texto exato de cada status e atividade", () => {
  assert.equal(RotulosDoCatalogo.status("DISPONIVEL"), "Disponível");
  assert.equal(RotulosDoCatalogo.status("MANUTENCAO"), "Manutenção");
  assert.equal(RotulosDoCatalogo.status("BLOQUEADA"), "Bloqueada");
  assert.equal(RotulosDoCatalogo.status("BAIXADA"), "Baixada");
  assert.equal(RotulosDoCatalogo.status("ALUGADA"), "Alugada");
  assert.equal(RotulosDoCatalogo.atividade("PASSEIO"), "Passeio");
  assert.equal(RotulosDoCatalogo.atividade("URBANO"), "Urbano");
  assert.equal(RotulosDoCatalogo.atividade("TRILHA"), "Trilha");
  assert.equal(RotulosDoCatalogo.atividade("ESPORTE"), "Esporte");
  assert.equal(RotulosDoCatalogo.atividade("TURISMO"), "Turismo");
});

test("as classes do painel só têm métodos estáticos: não se cria instância", () => {
  for (const Classe of [RotulosDoCatalogo, ConversorDeReais, PontosDasBicicletas]) {
    assert.throws(() => new (Classe as unknown as new () => unknown)(), /só tem métodos estáticos/);
  }
});

test("PontosDasBicicletas.distintos não altera a lista recebida", () => {
  const lista = [{ id: "1", ponto: { id: "a", nome: "A" } }] as BicicletaAdmin[];
  const copia = JSON.stringify(lista);
  PontosDasBicicletas.distintos(lista);
  assert.equal(JSON.stringify(lista), copia);
});
