import assert from "node:assert/strict";
import { test } from "node:test";
import { Cnpj } from "./cnpj.ts";
import { Cpf } from "./cpf.ts";

// ---------------------------------------------------------------- Cpf
test("Cpf.de aceita o CPF com e sem máscara e guarda só os dígitos", () => {
  for (const texto of ["529.982.247-25", "52998224725", " 529.982.247-25 "]) {
    const cpf = Cpf.de(texto);
    assert.ok(cpf, texto);
    assert.equal(cpf.digitos, "52998224725");
    assert.equal(cpf.formatado(), "529.982.247-25");
    assert.equal(String(cpf), "52998224725");
    assert.equal(JSON.stringify(cpf), '"52998224725"');
  }
});

test("Cpf.de recusa tamanho errado, dígitos repetidos e dígito verificador que não bate", () => {
  for (const ruim of ["", "123", "1234567890", "123456789012", "11111111111", "00000000000", "52998224726", "529.982.247-26", "abcdefghijk"]) {
    assert.equal(Cpf.de(ruim), null, ruim);
  }
});

test("Cpf.de recusa o que não é texto, sem lançar", () => {
  for (const ruim of [null, undefined, 52998224725, {}, []] as unknown[]) {
    assert.equal(Cpf.de(ruim as string), null, String(ruim));
  }
});

test("Cpf.de: trocar qualquer dígito de um CPF válido o invalida", () => {
  const base = "52998224725";
  for (let i = 0; i < 11; i++) {
    const trocado = base.slice(0, i) + String((Number(base[i]) + 1) % 10) + base.slice(i + 1);
    assert.equal(Cpf.de(trocado), null, `posição ${i}`);
  }
});

test("Cpf.mascarar põe pontos e traço enquanto digita e corta o que passa de 11 dígitos", () => {
  assert.equal(Cpf.mascarar(""), "");
  assert.equal(Cpf.mascarar("529"), "529");
  assert.equal(Cpf.mascarar("5299"), "529.9");
  assert.equal(Cpf.mascarar("529982"), "529.982");
  assert.equal(Cpf.mascarar("5299822"), "529.982.2");
  assert.equal(Cpf.mascarar("52998224725"), "529.982.247-25");
  assert.equal(Cpf.mascarar("529982247259999"), "529.982.247-25");
  assert.equal(Cpf.mascarar("529.982.247-25"), "529.982.247-25");
  assert.equal(Cpf.mascarar("abc5x2y9"), "529");
});

test("Cpf.somenteDigitos tira tudo que não é número", () => {
  assert.equal(Cpf.somenteDigitos("529.982.247-25"), "52998224725");
  assert.equal(Cpf.somenteDigitos("a1b2"), "12");
  assert.equal(Cpf.somenteDigitos(""), "");
});

test("Cpf.igual compara pelos dígitos, não pela máscara", () => {
  const a = Cpf.de("529.982.247-25");
  const b = Cpf.de("52998224725");
  assert.ok(a && b);
  assert.equal(a.igual(b), true);
});

test("Cpf é encapsulado: nenhum campo visível", () => {
  const cpf = Cpf.de("52998224725");
  assert.ok(cpf);
  assert.deepEqual(Object.keys(cpf), []);
});

// ---------------------------------------------------------------- Cnpj
test("Cnpj.de aceita com e sem máscara e guarda só os dígitos", () => {
  for (const texto of ["11.222.333/0001-81", "11222333000181", "12.345.678/0001-95"]) {
    const cnpj = Cnpj.de(texto);
    assert.ok(cnpj, texto);
    assert.equal(cnpj.digitos.length, 14);
  }
  assert.equal(Cnpj.de("11222333000181")?.formatado(), "11.222.333/0001-81");
  assert.equal(Cnpj.de("11.222.333/0001-81")?.digitos, "11222333000181");
});

test("Cnpj.de recusa tamanho errado, dígitos repetidos e dígito verificador que não bate", () => {
  for (const ruim of ["", "123", "11111111111111", "12.345.678/0001-96", "1122233300018", "112223330001811"]) {
    assert.equal(Cnpj.de(ruim), null, ruim);
  }
  for (const ruim of [null, undefined, 11222333000181, {}] as unknown[]) {
    assert.equal(Cnpj.de(ruim as string), null, String(ruim));
  }
});

test("Cnpj.igual e encapsulamento", () => {
  const a = Cnpj.de("11.222.333/0001-81");
  const b = Cnpj.de("11222333000181");
  assert.ok(a && b);
  assert.equal(a.igual(b), true);
  assert.deepEqual(Object.keys(a), []);
  assert.equal(JSON.stringify(a), '"11222333000181"');
});
