import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { GeradorDeCodigoDeReserva } from "./gerador-de-codigo.ts";

describe("GeradorDeCodigoDeReserva", () => {
  test("o código tem o formato BIC- + 6 caracteres sem os ambíguos (0, O, 1, I, L)", () => {
    for (let i = 0; i < 200; i++) {
      assert.match(GeradorDeCodigoDeReserva.padrao.gerar(), /^BIC-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    }
  });

  test("o código praticamente não se repete (menos de 10 repetições em 1000 gerações)", () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 1000; i++) vistos.add(GeradorDeCodigoDeReserva.padrao.gerar());
    assert.ok(vistos.size >= 990, `só ${vistos.size} códigos diferentes`);
  });

  test("sem viés: bytes altos são descartados e todos os 31 caracteres podem sair", () => {
    // 248 = 31 x 8 é o maior múltiplo de 31 abaixo de 256: bytes de 248 a 255 são rejeitados
    const bytes = [255, 248, ...Array.from({ length: 31 }, (_, i) => i), 0, 1, 2, 3, 4];
    let posicao = 0;
    const gerador = new GeradorDeCodigoDeReserva((n) => Uint8Array.from({ length: n }, () => bytes[posicao++ % bytes.length]));
    assert.equal(gerador.gerar(), "BIC-" + "23456789".slice(0, 6));
  });

  test("se uma rodada de bytes não basta (tudo descartado), sorteia de novo", () => {
    let rodadas = 0;
    const gerador = new GeradorDeCodigoDeReserva((n) => {
      rodadas++;
      return rodadas === 1 ? new Uint8Array(n).fill(255) : new Uint8Array(n).fill(0);
    });
    assert.equal(gerador.gerar(), "BIC-222222");
    assert.equal(rodadas, 2);
  });

  test("a fonte de bytes recebe 12 bytes por rodada", () => {
    const pedidos: number[] = [];
    new GeradorDeCodigoDeReserva((n) => {
      pedidos.push(n);
      return new Uint8Array(n);
    }).gerar();
    assert.deepEqual(pedidos, [12]);
  });

  test("encapsulamento: a instância não expõe campos", () => {
    assert.deepEqual(Object.keys(GeradorDeCodigoDeReserva.padrao), []);
    assert.deepEqual(Object.keys(new GeradorDeCodigoDeReserva(() => new Uint8Array(12))), []);
  });
});
