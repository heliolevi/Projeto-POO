import assert from "node:assert/strict";
import { test } from "node:test";
import { Dinheiro } from "./dinheiro.ts";

// A formatação em reais é do Dinheiro (formatar). Estes são os casos que a tela usa.
const formatarReais = (centavos: number) => Dinheiro.deCentavos(centavos).formatar();

test("formatarReais usa ponto nos milhares e vírgula nos centavos", () => {
  assert.equal(formatarReais(123456), "R$ 1.234,56");
});

test("formatarReais mostra zero e valores abaixo de um real", () => {
  assert.equal(formatarReais(0), "R$ 0,00");
  assert.equal(formatarReais(5), "R$ 0,05");
  assert.equal(formatarReais(5000), "R$ 50,00");
});

test("formatarReais usa espaço comum, não o espaço sem quebra do Intl", () => {
  assert.ok(!formatarReais(100).includes(" "));
});

test("formatarReais recusa valor que não seja centavo inteiro", () => {
  assert.throws(() => formatarReais(10.5), RangeError);
  assert.throws(() => formatarReais(Number.NaN), RangeError);
});

// ---------- formatarDataHora (fuso America/Fortaleza, UTC-3) ----------

test("formatarReais: separador de milhar em todas as ordens de grandeza", () => {
  assert.equal(formatarReais(99), "R$ 0,99");
  assert.equal(formatarReais(100), "R$ 1,00");
  assert.equal(formatarReais(99_999), "R$ 999,99");
  assert.equal(formatarReais(100_000), "R$ 1.000,00");
  assert.equal(formatarReais(123_456_789), "R$ 1.234.567,89");
  assert.equal(formatarReais(100_000_000_000), "R$ 1.000.000.000,00");
});

test("formatarReais: -0 é tratado como zero, sem sinal", () => {
  assert.equal(formatarReais(-0), "R$ 0,00");
});

test("formatarReais recusa Infinity e valores não numéricos", () => {
  assert.throws(() => formatarReais(Infinity), RangeError);
  assert.throws(() => formatarReais(-Infinity), RangeError);
  assert.throws(() => formatarReais("100" as unknown as number), RangeError);
  assert.throws(() => formatarReais(undefined as unknown as number), RangeError);
});

test("formatarReais: valores do contrato (R$ 10, 50 e 150)", () => {
  assert.equal(formatarReais(1000), "R$ 10,00");
  assert.equal(formatarReais(5000), "R$ 50,00");
  assert.equal(formatarReais(15000), "R$ 150,00");
});

test("formatarReais: de 0 a 99.999 centavos sempre há exatamente duas casas decimais", () => {
  for (let c = 0; c < 100_000; c++) {
    const texto = formatarReais(c);
    assert.match(texto, /^R\$ \d{1,3}(\.\d{3})*,\d{2}$/, `centavos=${c}`);
    // volta para centavos e confere
    const volta = Number(texto.replace("R$ ", "").replace(/\./g, "").replace(",", ""));
    assert.equal(volta, c);
  }
});

// ---------- formatarDataHora ----------

test("formatarReais: negativo é recusado (Dinheiro não existe abaixo de zero)", () => {
  assert.throws(() => formatarReais(-5), RangeError);
  assert.throws(() => formatarReais(-123_456), RangeError);
});

