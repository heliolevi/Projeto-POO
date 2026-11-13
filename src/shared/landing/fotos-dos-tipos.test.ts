import { test } from "node:test";
import assert from "node:assert/strict";
import { FOTO_TRILHA, fotoPorId } from "./fotos.ts";
import { fotoDoTipoPorId, montarMapa } from "./fotos-dos-tipos.ts";

test("com o catálogo carregado, a foto vem das atividades do tipo", () => {
  const mapa = montarMapa([{ id: "t1", atividades: ["TRILHA"] }]);
  assert.equal(fotoDoTipoPorId(mapa, "t1"), FOTO_TRILHA);
});

test("sem o catálogo, ou com um tipo desconhecido, cai na foto estável pelo id", () => {
  assert.equal(fotoDoTipoPorId(null, "t9"), fotoPorId("t9"));
  assert.equal(fotoDoTipoPorId(montarMapa([]), "t9"), fotoPorId("t9"));
});
