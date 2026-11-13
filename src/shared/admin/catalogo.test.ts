import { test } from "node:test";
import assert from "node:assert/strict";
import { pontosDasBicicletas, reaisParaCentavos, type BicicletaAdmin } from "./catalogo.ts";

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
