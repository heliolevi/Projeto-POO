import assert from "node:assert/strict";
import { test } from "node:test";
import { horasCobradas, valorAluguelCentavos } from "./preco.ts";

const PASSEIO = { precoHoraCentavos: 1200, precoDiaCentavos: 6000 };

test("cobra por hora enquanto sair mais barato que o dia", () => {
  assert.equal(valorAluguelCentavos(PASSEIO, 1), 1200);
  assert.equal(valorAluguelCentavos(PASSEIO, 4), 4800);
});

test("as horas de um dia nunca passam do preço por dia", () => {
  assert.equal(valorAluguelCentavos(PASSEIO, 5), 6000);
  assert.equal(valorAluguelCentavos(PASSEIO, 23), 6000);
  assert.equal(valorAluguelCentavos(PASSEIO, 24), 6000);
});

test("cada bloco de 24 horas custa um dia, e o que sobra segue a mesma regra", () => {
  assert.equal(valorAluguelCentavos(PASSEIO, 25), 6000 + 1200);
  assert.equal(valorAluguelCentavos(PASSEIO, 48), 12000);
  assert.equal(valorAluguelCentavos(PASSEIO, 7 * 24), 42000);
});

test("o valor nunca diminui quando o período aumenta", () => {
  let anterior = 0;
  for (let horas = 1; horas <= 7 * 24; horas++) {
    const valor = valorAluguelCentavos(PASSEIO, horas);
    assert.ok(valor >= anterior, `${horas} h`);
    assert.ok(Number.isInteger(valor));
    anterior = valor;
  }
});

test("horasCobradas arredonda para cima", () => {
  const inicio = new Date("2026-11-14T12:00:00.000Z");
  assert.equal(horasCobradas(inicio, new Date("2026-11-14T13:00:00.000Z")), 1);
  assert.equal(horasCobradas(inicio, new Date("2026-11-14T16:10:00.000Z")), 5);
  assert.equal(horasCobradas(inicio, new Date("2026-11-14T16:00:00.001Z")), 5);
});

test("período sem ao menos 1 hora inteira é erro de programação", () => {
  assert.throws(() => valorAluguelCentavos(PASSEIO, 0), RangeError);
  assert.throws(() => valorAluguelCentavos(PASSEIO, 1.5), RangeError);
});
