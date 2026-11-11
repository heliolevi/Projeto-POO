import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CENTAVOS_MAX,
  STATUS_BICICLETA,
  validarAtualizacaoBicicleta,
  validarFiltroBicicletas,
  validarNovaBicicleta,
  validarTipo,
} from "./validacao.ts";

const TIPO = {
  nome: "  Urbana  ",
  descricao: "Para o dia a dia",
  atividades: ["URBANO", "PASSEIO"],
  alturaMinCm: 150,
  alturaMaxCm: 195,
  nivelRecomendado: "INICIANTE",
  precoHoraCentavos: 1000,
  precoDiaCentavos: 5000,
  valorCaucaoCentavos: 15000,
  ativo: true,
};

const UUID_A = "3f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6f";
const UUID_B = "aaaaaaaa-0000-4000-8000-000000000001";

function erros(entrada: unknown): Record<string, string> {
  const r = validarTipo(entrada);
  assert.ok("erros" in r, "deveria ter erros");
  return r.erros;
}

// ---------------------------------------------------------------------------
// Tipo de bicicleta
// ---------------------------------------------------------------------------
test("tipo válido: aceita e normaliza o nome", () => {
  const r = validarTipo(TIPO);
  assert.ok("dados" in r);
  assert.equal(r.dados.nome, "Urbana");
  assert.deepEqual(r.dados.atividades, ["URBANO", "PASSEIO"]);
  assert.equal(r.dados.valorCaucaoCentavos, 15000);
  assert.equal(r.dados.ativo, true);
});

test("campos opcionais ficam com os padrões do banco", () => {
  const minimo: Record<string, unknown> = { ...TIPO };
  for (const campo of ["nivelRecomendado", "valorCaucaoCentavos", "ativo", "descricao"]) delete minimo[campo];
  const r = validarTipo(minimo);
  assert.ok("dados" in r);
  assert.equal(r.dados.nivelRecomendado, "INICIANTE");
  assert.equal(r.dados.valorCaucaoCentavos, 0);
  assert.equal(r.dados.descricao, null);
  assert.equal(r.dados.ativo, null, "ativo não informado: o PUT mantém o que o tipo já tinha");
});

test("nome: obrigatório, de 2 a 80 caracteres, espaços repetidos viram um", () => {
  for (const nome of [undefined, null, "", " ", "A", "x".repeat(81), 123, ["Urbana"]]) {
    assert.ok(erros({ ...TIPO, nome }).nome, String(nome));
  }
  const r = validarTipo({ ...TIPO, nome: "Mountain   bike" });
  assert.ok("dados" in r);
  assert.equal(r.dados.nome, "Mountain bike");
});

test("atividades: ao menos uma, todas do enum, repetidas viram uma", () => {
  for (const atividades of [undefined, [], "PASSEIO", ["CORRIDA"], ["PASSEIO", "passeio"], [1], [null]]) {
    assert.ok(erros({ ...TIPO, atividades }).atividades, JSON.stringify(atividades));
  }
  const r = validarTipo({ ...TIPO, atividades: ["TRILHA", "ESPORTE", "TRILHA"] });
  assert.ok("dados" in r);
  assert.deepEqual(r.dados.atividades, ["TRILHA", "ESPORTE"]);
});

test("altura mínima e máxima: inteiros de 100 a 250, com mínima <= máxima", () => {
  for (const alturaMinCm of [99, 251, 150.5, "150", null, undefined]) {
    assert.ok(erros({ ...TIPO, alturaMinCm }).alturaMinCm, String(alturaMinCm));
  }
  for (const alturaMaxCm of [99, 251, 190.1, "190", null, undefined]) {
    assert.ok(erros({ ...TIPO, alturaMaxCm }).alturaMaxCm, String(alturaMaxCm));
  }
  assert.match(erros({ ...TIPO, alturaMinCm: 200, alturaMaxCm: 150 }).alturaMaxCm, /maior ou igual/);
  // mínima igual à máxima é permitido (faixa de um valor só)
  assert.ok("dados" in validarTipo({ ...TIPO, alturaMinCm: 170, alturaMaxCm: 170 }));
  assert.ok("dados" in validarTipo({ ...TIPO, alturaMinCm: 100, alturaMaxCm: 250 }));
});

test("preços e caução: inteiros em centavos, de 0 ao limite do banco", () => {
  for (const valor of [-1, 10.5, "1000", NaN, Infinity, null, undefined, CENTAVOS_MAX + 1, 1e21, true, []]) {
    assert.ok(erros({ ...TIPO, precoHoraCentavos: valor }).precoHoraCentavos, `hora ${String(valor)}`);
    assert.ok(erros({ ...TIPO, precoDiaCentavos: valor }).precoDiaCentavos, `dia ${String(valor)}`);
  }
  for (const valor of [-1, 10.5, "1000", NaN, CENTAVOS_MAX + 1, true]) {
    assert.ok(erros({ ...TIPO, valorCaucaoCentavos: valor }).valorCaucaoCentavos, `caução ${String(valor)}`);
  }
  assert.ok("dados" in validarTipo({ ...TIPO, precoHoraCentavos: 0, precoDiaCentavos: 0, valorCaucaoCentavos: 0 }));
  assert.ok("dados" in validarTipo({ ...TIPO, precoHoraCentavos: CENTAVOS_MAX }));
});

test("nivelRecomendado, ativo e descricao são conferidos", () => {
  assert.ok(erros({ ...TIPO, nivelRecomendado: "EXPERT" }).nivelRecomendado);
  assert.ok(erros({ ...TIPO, ativo: "sim" }).ativo);
  assert.ok(erros({ ...TIPO, ativo: 1 }).ativo);
  assert.ok(erros({ ...TIPO, descricao: "x".repeat(501) }).descricao);
  assert.ok(erros({ ...TIPO, descricao: 5 }).descricao);
});

test("devolve os erros de todos os campos de uma vez", () => {
  const e = erros({
    nome: "",
    atividades: [],
    alturaMinCm: 5,
    alturaMaxCm: 999,
    precoHoraCentavos: -1,
    precoDiaCentavos: 1.5,
  });
  assert.deepEqual(
    Object.keys(e).sort(),
    ["alturaMaxCm", "alturaMinCm", "atividades", "nome", "precoDiaCentavos", "precoHoraCentavos"],
  );
});

test("corpo que não é objeto é recusado", () => {
  for (const corpo of [null, undefined, "texto", 42, [], [TIPO]]) {
    assert.ok(erros(corpo).corpo, String(corpo));
  }
});

test("campos desconhecidos (id, ativo de outro tipo...) são ignorados", () => {
  const r = validarTipo({ ...TIPO, id: UUID_A, criadoEm: "2020-01-01", perfil: "ADMIN" });
  assert.ok("dados" in r);
  assert.deepEqual(Object.keys(r.dados).sort(), [
    "alturaMaxCm",
    "alturaMinCm",
    "atividades",
    "ativo",
    "descricao",
    "nivelRecomendado",
    "nome",
    "precoDiaCentavos",
    "precoHoraCentavos",
    "valorCaucaoCentavos",
  ]);
});

// ---------------------------------------------------------------------------
// Bicicleta
// ---------------------------------------------------------------------------
const BICI = { tipoId: UUID_A, pontoId: UUID_B, codigo: "bic-015", numeroSerie: "SN999", tamanhoQuadro: "M", observacoes: null };

function errosBici(entrada: unknown): Record<string, string> {
  const r = validarNovaBicicleta(entrada);
  assert.ok("erros" in r, "deveria ter erros");
  return r.erros;
}

test("bicicleta válida: código vai para maiúsculas e sem espaços nas pontas", () => {
  const r = validarNovaBicicleta({ ...BICI, codigo: "  bic-015  " });
  assert.ok("dados" in r);
  assert.equal(r.dados.codigo, "BIC-015");
  assert.equal(r.dados.numeroSerie, "SN999");
  assert.equal(r.dados.observacoes, null);
});

test("bicicleta: os opcionais podem faltar e texto vazio vira null", () => {
  const r = validarNovaBicicleta({ tipoId: UUID_A, pontoId: UUID_B, codigo: "B1", numeroSerie: "  ", tamanhoQuadro: "" });
  assert.ok("dados" in r);
  assert.equal(r.dados.numeroSerie, null);
  assert.equal(r.dados.tamanhoQuadro, null);
  assert.equal(r.dados.observacoes, null);
});

test("bicicleta: tipoId e pontoId precisam ser UUID", () => {
  for (const valor of [undefined, null, "", "abc", "1; DROP TABLE bicicleta", 123, UUID_A + "x"]) {
    assert.ok(errosBici({ ...BICI, tipoId: valor }).tipoId, String(valor));
    assert.ok(errosBici({ ...BICI, pontoId: valor }).pontoId, String(valor));
  }
});

test("bicicleta: código obrigatório, até 40 caracteres e só caracteres de etiqueta", () => {
  for (const codigo of [undefined, null, "", "   ", "x".repeat(41), "A;B", "A'B", "<b>", "-X", 15]) {
    assert.ok(errosBici({ ...BICI, codigo }).codigo, JSON.stringify(codigo));
  }
  for (const codigo of ["BIC-001", "b 12", "A.1/2_3", "Ç-9", "7"]) {
    assert.ok("dados" in validarNovaBicicleta({ ...BICI, codigo }), codigo);
  }
});

test("bicicleta: limites dos campos de texto", () => {
  assert.ok(errosBici({ ...BICI, numeroSerie: "x".repeat(61) }).numeroSerie);
  assert.ok(errosBici({ ...BICI, tamanhoQuadro: "x".repeat(21) }).tamanhoQuadro);
  assert.ok(errosBici({ ...BICI, observacoes: "x".repeat(501) }).observacoes);
  assert.ok(errosBici({ ...BICI, observacoes: 5 }).observacoes);
});

test("bicicleta: corpo que não é objeto é recusado", () => {
  for (const corpo of [null, undefined, "x", 1, [], [BICI]]) assert.ok(errosBici(corpo).corpo);
});

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------
test("PATCH aceita status, observações ou os dois", () => {
  assert.deepEqual(validarAtualizacaoBicicleta({ status: "MANUTENCAO" }), { dados: { status: "MANUTENCAO" } });
  assert.deepEqual(validarAtualizacaoBicicleta({ observacoes: " pneu furado " }), { dados: { observacoes: "pneu furado" } });
  assert.deepEqual(validarAtualizacaoBicicleta({ status: "DISPONIVEL", observacoes: null }), {
    dados: { status: "DISPONIVEL", observacoes: null },
  });
  assert.deepEqual(validarAtualizacaoBicicleta({ observacoes: "" }), { dados: { observacoes: null } });
});

test("PATCH sem nenhum campo (corpo vazio) é 400", () => {
  for (const corpo of [{}, { id: UUID_A }, { codigo: "NOVO" }]) {
    const r = validarAtualizacaoBicicleta(corpo);
    assert.ok("erros" in r, JSON.stringify(corpo));
    assert.ok(r.erros.corpo);
  }
});

test("PATCH: status fora dos quatro permitidos é 400 (ALUGADA não é usada no MVP)", () => {
  for (const status of ["ALUGADA", "manutencao", "", null, 1, "OUTRO"]) {
    const r = validarAtualizacaoBicicleta({ status });
    assert.ok("erros" in r, String(status));
    assert.ok(r.erros.status);
  }
  for (const status of STATUS_BICICLETA) assert.ok("dados" in validarAtualizacaoBicicleta({ status }));
});

test("PATCH: observações longas ou de tipo errado são 400; corpo que não é objeto também", () => {
  assert.ok("erros" in validarAtualizacaoBicicleta({ observacoes: "x".repeat(501) }));
  assert.ok("erros" in validarAtualizacaoBicicleta({ observacoes: 7 }));
  for (const corpo of [null, undefined, "x", [], 3]) assert.ok("erros" in validarAtualizacaoBicicleta(corpo));
});

// ---------------------------------------------------------------------------
// Filtros do GET
// ---------------------------------------------------------------------------
test("filtros: sem nada, devolve nulos", () => {
  assert.deepEqual(validarFiltroBicicletas({}), { dados: { tipoId: null, status: null } });
  assert.deepEqual(validarFiltroBicicletas({ tipoId: null, status: null }), { dados: { tipoId: null, status: null } });
});

test("filtros: tipoId UUID e status do enum", () => {
  assert.deepEqual(validarFiltroBicicletas({ tipoId: UUID_A, status: "BAIXADA" }), {
    dados: { tipoId: UUID_A, status: "BAIXADA" },
  });
  const r = validarFiltroBicicletas({ tipoId: "x", status: "ALUGADA" });
  assert.ok("erros" in r);
  assert.deepEqual(Object.keys(r.erros).sort(), ["status", "tipoId"]);
  assert.ok("erros" in validarFiltroBicicletas({ status: "" }), "status vazio não é um filtro válido");
});
