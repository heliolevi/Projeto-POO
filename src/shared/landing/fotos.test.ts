import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { FOTO_PASSEIO, FOTO_TRILHA, fotoDoTipo } from "./fotos.ts";

test("tipos de trilha ou esporte mostram a mountain bike", () => {
  assert.equal(fotoDoTipo(["TRILHA"]), FOTO_TRILHA);
  assert.equal(fotoDoTipo(["PASSEIO", "ESPORTE"]), FOTO_TRILHA);
});

test("os demais tipos, e a lista vazia, mostram a bicicleta de passeio", () => {
  assert.equal(fotoDoTipo(["PASSEIO", "URBANO", "TURISMO"]), FOTO_PASSEIO);
  assert.equal(fotoDoTipo([]), FOTO_PASSEIO);
});

test("os arquivos das fotos existem em public e têm texto alternativo", () => {
  for (const foto of [FOTO_PASSEIO, FOTO_TRILHA]) {
    assert.ok(existsSync(new URL(`../../../public${foto.src}`, import.meta.url)), foto.src);
    assert.ok(foto.alt.length > 10, foto.src);
    assert.ok(foto.largura > 0 && foto.altura > 0);
  }
});
