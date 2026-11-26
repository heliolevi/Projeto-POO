import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  FOTO_PASSEIO,
  FOTO_TRILHA,
  FOTO_TURISMO,
  FOTO_URBANA,
  TODAS_AS_FOTOS,
  fotoDoTipo,
  fotoPorId,
} from "./fotos.ts";

test("trilha e esporte mostram a mountain bike, mesmo junto de outras atividades", () => {
  assert.equal(fotoDoTipo(["TRILHA"]), FOTO_TRILHA);
  assert.equal(fotoDoTipo(["PASSEIO", "ESPORTE"]), FOTO_TRILHA);
  assert.equal(fotoDoTipo(["URBANO", "TRILHA"]), FOTO_TRILHA);
});

test("urbano e turismo têm foto própria, e o resto cai na bicicleta de passeio", () => {
  assert.equal(fotoDoTipo(["URBANO"]), FOTO_URBANA);
  assert.equal(fotoDoTipo(["PASSEIO", "TURISMO"]), FOTO_TURISMO);
  assert.equal(fotoDoTipo(["URBANO", "TURISMO"]), FOTO_URBANA);
  assert.equal(fotoDoTipo(["PASSEIO"]), FOTO_PASSEIO);
  assert.equal(fotoDoTipo([]), FOTO_PASSEIO);
  assert.equal(fotoDoTipo(["ATIVIDADE_NOVA"]), FOTO_PASSEIO);
});

test("fotoPorId devolve sempre a mesma foto para o mesmo id e usa fotos da lista", () => {
  const id = "9f1c2d3e-aaaa-bbbb-cccc-111122223333";
  assert.equal(fotoPorId(id), fotoPorId(id));
  assert.ok(TODAS_AS_FOTOS.includes(fotoPorId(id)));
  assert.ok(TODAS_AS_FOTOS.includes(fotoPorId("")));
});

test("fotoPorId espalha ids diferentes entre as 4 fotos", () => {
  const usadas = new Set<string>();
  for (let i = 0; i < 40; i++) usadas.add(fotoPorId(`tipo-${i}`).src);
  assert.equal(usadas.size, TODAS_AS_FOTOS.length);
});

test("os arquivos das fotos existem em public, com texto alternativo e medidas", () => {
  assert.equal(new Set(TODAS_AS_FOTOS.map((f) => f.src)).size, 4);
  for (const foto of TODAS_AS_FOTOS) {
    assert.ok(existsSync(new URL(`../../../public${foto.src}`, import.meta.url)), foto.src);
    assert.ok(foto.alt.length > 10, foto.src);
    assert.ok(foto.largura > 0 && foto.altura > 0, foto.src);
  }
});
