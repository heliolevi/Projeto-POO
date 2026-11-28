import { test } from "node:test";
import assert from "node:assert/strict";
import { FOTO_TRILHA, FotosDasBicicletas } from "./fotos.ts";
import { FotosDosTipos } from "./fotos-dos-tipos.ts";

test("com o catálogo carregado, a foto vem das atividades do tipo", () => {
  const mapa = FotosDosTipos.montarMapa([{ id: "t1", atividades: ["TRILHA"] }]);
  assert.equal(FotosDosTipos.doTipo(mapa, "t1"), FOTO_TRILHA);
});

test("sem o catálogo, ou com um tipo desconhecido, cai na foto estável pelo id", () => {
  assert.equal(FotosDosTipos.doTipo(null, "t9"), FotosDasBicicletas.porId("t9"));
  assert.equal(FotosDosTipos.doTipo(FotosDosTipos.montarMapa([]), "t9"), FotosDasBicicletas.porId("t9"));
});

test("FotosDosTipos só tem métodos estáticos: não se cria instância", () => {
  assert.throws(() => new (FotosDosTipos as unknown as new () => unknown)(), /só tem métodos estáticos/);
});
