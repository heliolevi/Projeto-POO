import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Periodo } from "./periodo-aluguel.ts";
import { calcularValorAluguel } from "./preco-aluguel.ts";

const T = (hora: number, min = 0) => new Date(Date.UTC(2026, 10, 14, hora, min));

describe("Periodo", () => {
  test("guarda início e fim e calcula a duração", () => {
    const p = Periodo.de(T(9), T(13));
    assert.equal(p.inicio.getTime(), T(9).getTime());
    assert.equal(p.fim.getTime(), T(13).getTime());
    assert.equal(p.duracaoMs, 4 * 3600_000);
  });

  test("recusa fim igual ou antes do início e datas inválidas", () => {
    assert.throws(() => Periodo.de(T(9), T(9)), RangeError);
    assert.throws(() => Periodo.de(T(10), T(9)), RangeError);
    assert.throws(() => Periodo.de(new Date("lixo"), T(9)), RangeError);
    assert.throws(() => Periodo.de(T(9), new Date("lixo")), RangeError);
  });

  test("encapsulamento: as datas devolvidas são cópias e não alteram o período", () => {
    const p = Periodo.de(T(9), T(13));
    p.inicio.setUTCFullYear(1999);
    p.fim.setUTCFullYear(1999);
    assert.equal(p.inicio.getTime(), T(9).getTime());
    assert.equal(p.fim.getTime(), T(13).getTime());
  });

  test("a data de entrada alterada depois não muda o período", () => {
    const inicio = T(9);
    const p = Periodo.de(inicio, T(13));
    inicio.setUTCFullYear(1999);
    assert.equal(p.inicio.getTime(), T(9).getTime());
  });

  test("horasCobradas arredonda para cima", () => {
    assert.equal(Periodo.de(T(9), T(12)).horasCobradas, 3);
    assert.equal(Periodo.de(T(9), T(12, 10)).horasCobradas, 4);
    assert.equal(Periodo.de(T(9), T(9, 1)).horasCobradas, 1);
  });

  test("sobrepoe: cruzar conta, encostar não conta, conter conta", () => {
    const base = Periodo.de(T(10), T(12));
    assert.ok(base.sobrepoe(Periodo.de(T(11), T(13))));
    assert.ok(base.sobrepoe(Periodo.de(T(9), T(11))));
    assert.ok(base.sobrepoe(Periodo.de(T(10, 30), T(11, 30))));
    assert.ok(base.sobrepoe(Periodo.de(T(9), T(13))));
    assert.ok(base.sobrepoe(base));
    assert.ok(!base.sobrepoe(Periodo.de(T(12), T(14))));
    assert.ok(!base.sobrepoe(Periodo.de(T(8), T(10))));
    assert.ok(!base.sobrepoe(Periodo.de(T(13), T(15))));
  });

  test("sobrepoe é simétrico", () => {
    const a = Periodo.de(T(10), T(12));
    const b = Periodo.de(T(11), T(14));
    assert.equal(a.sobrepoe(b), b.sobrepoe(a));
  });

  test("contem: início incluído, fim excluído", () => {
    const p = Periodo.de(T(10), T(12));
    assert.ok(p.contem(T(10)));
    assert.ok(p.contem(T(11, 59)));
    assert.ok(!p.contem(T(12)));
    assert.ok(!p.contem(T(9, 59)));
  });

  test("comNovoFim devolve outro período e mantém o original", () => {
    const p = Periodo.de(T(10), T(12));
    const maior = p.comNovoFim(T(15));
    assert.equal(maior.fim.getTime(), T(15).getTime());
    assert.equal(maior.inicio.getTime(), T(10).getTime());
    assert.equal(p.fim.getTime(), T(12).getTime());
    assert.throws(() => p.comNovoFim(T(10)), RangeError);
  });

  test("igual compara os dois limites", () => {
    assert.ok(Periodo.de(T(10), T(12)).igual(Periodo.de(T(10), T(12))));
    assert.ok(!Periodo.de(T(10), T(12)).igual(Periodo.de(T(10), T(13))));
  });

  test("toJSON usa ISO 8601", () => {
    assert.deepEqual(Periodo.de(T(9), T(13)).toJSON(), {
      inicio: "2026-11-14T09:00:00.000Z",
      fim: "2026-11-14T13:00:00.000Z",
    });
  });

  test("é aceito pela regra de preço, que recebe { inicio, fim }", () => {
    const valor = calcularValorAluguel(Periodo.de(T(9), T(13)), {
      precoHoraCentavos: 1200,
      precoDiaCentavos: 6000,
    });
    assert.equal(valor, 4800);
  });
});
