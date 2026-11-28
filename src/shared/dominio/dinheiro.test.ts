import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Dinheiro } from "./dinheiro.ts";

describe("Dinheiro", () => {
  test("cria a partir de centavos inteiros e expõe o valor", () => {
    assert.equal(Dinheiro.deCentavos(1250).centavos, 1250);
    assert.equal(Dinheiro.deCentavos(0).centavos, 0);
  });

  test("recusa centavos que não são inteiros seguros e não negativos", () => {
    for (const ruim of [-1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "10" as unknown as number]) {
      assert.throws(() => Dinheiro.deCentavos(ruim), RangeError, String(ruim));
    }
  });

  test("o zero é sempre o mesmo objeto e ehZero funciona", () => {
    assert.equal(Dinheiro.deCentavos(0), Dinheiro.ZERO);
    assert.ok(Dinheiro.ZERO.ehZero());
    assert.ok(!Dinheiro.deCentavos(1).ehZero());
  });

  test("somar devolve um novo valor e não altera os originais (imutável)", () => {
    const a = Dinheiro.deCentavos(1000);
    const b = Dinheiro.deCentavos(250);
    const soma = a.somar(b);
    assert.equal(soma.centavos, 1250);
    assert.equal(a.centavos, 1000);
    assert.equal(b.centavos, 250);
  });

  test("somar acima do maior inteiro seguro é recusado", () => {
    const grande = Dinheiro.deCentavos(Number.MAX_SAFE_INTEGER);
    assert.throws(() => grande.somar(Dinheiro.deCentavos(1)), RangeError);
  });

  test("subtrair dá a diferença e recusa resultado negativo", () => {
    assert.equal(Dinheiro.deCentavos(1000).subtrair(Dinheiro.deCentavos(400)).centavos, 600);
    assert.equal(Dinheiro.deCentavos(500).subtrair(Dinheiro.deCentavos(500)).centavos, 0);
    assert.throws(() => Dinheiro.deCentavos(100).subtrair(Dinheiro.deCentavos(101)), RangeError);
  });

  test("multiplicar só aceita quantidade inteira não negativa", () => {
    assert.equal(Dinheiro.deCentavos(1200).multiplicar(3).centavos, 3600);
    assert.equal(Dinheiro.deCentavos(1200).multiplicar(0).centavos, 0);
    for (const ruim of [-1, 0.5, Number.NaN]) {
      assert.throws(() => Dinheiro.deCentavos(1200).multiplicar(ruim), RangeError, String(ruim));
    }
  });

  test("comparações", () => {
    const dez = Dinheiro.deCentavos(1000);
    const vinte = Dinheiro.deCentavos(2000);
    assert.ok(dez.menorQue(vinte));
    assert.ok(vinte.maiorQue(dez));
    assert.ok(dez.igual(Dinheiro.deCentavos(1000)));
    assert.ok(!dez.igual(vinte));
    assert.ok(!dez.maiorQue(dez));
    assert.ok(!dez.menorQue(dez));
  });

  test("menor devolve o menor dos dois", () => {
    const dez = Dinheiro.deCentavos(1000);
    const vinte = Dinheiro.deCentavos(2000);
    assert.equal(Dinheiro.menor(dez, vinte), dez);
    assert.equal(Dinheiro.menor(vinte, dez), dez);
  });

  test("formatar usa vírgula, ponto de milhar e dois dígitos de centavos", () => {
    assert.equal(Dinheiro.deCentavos(0).formatar(), "R$ 0,00");
    assert.equal(Dinheiro.deCentavos(5).formatar(), "R$ 0,05");
    assert.equal(Dinheiro.deCentavos(1250).formatar(), "R$ 12,50");
    assert.equal(Dinheiro.deCentavos(123450).formatar(), "R$ 1.234,50");
    assert.equal(Dinheiro.deCentavos(100000000).formatar(), "R$ 1.000.000,00");
    assert.equal(`${Dinheiro.deCentavos(4800)}`, "R$ 48,00");
  });

  test("no JSON vira o número de centavos, como o contrato da API", () => {
    assert.equal(JSON.stringify({ valor: Dinheiro.deCentavos(4800) }), '{"valor":4800}');
  });
});
