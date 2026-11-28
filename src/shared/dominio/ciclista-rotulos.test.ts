import assert from "node:assert/strict";
import { test } from "node:test";
import { ATIVIDADES, EXPERIENCIAS } from "./ciclista.ts";
import { RotulosDoCiclista } from "./ciclista-rotulos.ts";

test("toda experiência e toda atividade têm rótulo e descrição não vazios", () => {
  for (const e of EXPERIENCIAS) {
    assert.ok(RotulosDoCiclista.experiencia(e).length > 0, e);
    assert.ok(RotulosDoCiclista.descricaoDaExperiencia(e).length > 0, e);
  }
  for (const a of ATIVIDADES) {
    assert.ok(RotulosDoCiclista.atividade(a).length > 0, a);
    assert.ok(RotulosDoCiclista.descricaoDaAtividade(a).length > 0, a);
  }
});

test("os rótulos são os textos que o cliente lê", () => {
  assert.equal(RotulosDoCiclista.experiencia("INTERMEDIARIO"), "Intermediário");
  assert.equal(RotulosDoCiclista.atividade("URBANO"), "Deslocamento urbano");
  assert.equal(RotulosDoCiclista.descricaoDaAtividade("TRILHA"), "Terra, areia e subida.");
  assert.equal(RotulosDoCiclista.descricaoDaExperiencia("AVANCADO"), "Encaro subida, trilha e distância longa.");
});

test("RotulosDoCiclista só tem métodos estáticos: criar instância é recusado", () => {
  assert.throws(() => new (RotulosDoCiclista as unknown as new () => object)(), /só tem métodos estáticos/);
});
