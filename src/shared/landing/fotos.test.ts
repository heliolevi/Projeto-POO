import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  FOTO_PASSEIO,
  FOTO_TRILHA,
  FOTO_TURISMO,
  FOTO_URBANA,
  TODAS_AS_FOTOS,
  FotosDasBicicletas,
} from "./fotos.ts";

test("trilha e esporte mostram a mountain bike, mesmo junto de outras atividades", () => {
  assert.equal(FotosDasBicicletas.doTipo(["TRILHA"]), FOTO_TRILHA);
  assert.equal(FotosDasBicicletas.doTipo(["PASSEIO", "ESPORTE"]), FOTO_TRILHA);
  assert.equal(FotosDasBicicletas.doTipo(["URBANO", "TRILHA"]), FOTO_TRILHA);
});

test("urbano e turismo têm foto própria, e o resto cai na bicicleta de passeio", () => {
  assert.equal(FotosDasBicicletas.doTipo(["URBANO"]), FOTO_URBANA);
  assert.equal(FotosDasBicicletas.doTipo(["PASSEIO", "TURISMO"]), FOTO_TURISMO);
  assert.equal(FotosDasBicicletas.doTipo(["URBANO", "TURISMO"]), FOTO_URBANA);
  assert.equal(FotosDasBicicletas.doTipo(["PASSEIO"]), FOTO_PASSEIO);
  assert.equal(FotosDasBicicletas.doTipo([]), FOTO_PASSEIO);
  assert.equal(FotosDasBicicletas.doTipo(["ATIVIDADE_NOVA"]), FOTO_PASSEIO);
});

test("FotosDasBicicletas.porId devolve sempre a mesma foto para o mesmo id e usa fotos da lista", () => {
  const id = "9f1c2d3e-aaaa-bbbb-cccc-111122223333";
  assert.equal(FotosDasBicicletas.porId(id), FotosDasBicicletas.porId(id));
  assert.ok(TODAS_AS_FOTOS.includes(FotosDasBicicletas.porId(id)));
  assert.ok(TODAS_AS_FOTOS.includes(FotosDasBicicletas.porId("")));
});

test("FotosDasBicicletas.porId espalha ids diferentes entre as 4 fotos", () => {
  const usadas = new Set<string>();
  for (let i = 0; i < 40; i++) usadas.add(FotosDasBicicletas.porId(`tipo-${i}`).src);
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

test("FotosDasBicicletas só tem métodos estáticos: não se cria instância", () => {
  assert.throws(() => new (FotosDasBicicletas as unknown as new () => unknown)(), /só tem métodos estáticos/);
});
