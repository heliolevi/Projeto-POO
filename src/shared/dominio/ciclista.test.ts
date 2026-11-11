import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALTURA_MAX_CM,
  ALTURA_MIN_CM,
  ATIVIDADES,
  EXPERIENCIAS,
  alturaValida,
  ehAtividade,
  ehExperiencia,
} from "./ciclista.ts";

// Os valores precisam ser exatamente os dos enums do banco (migration 0004).
test("as listas são as dos enums experiencia e atividade do banco", () => {
  assert.deepEqual([...EXPERIENCIAS], ["INICIANTE", "INTERMEDIARIO", "AVANCADO"]);
  assert.deepEqual([...ATIVIDADES], ["PASSEIO", "URBANO", "TRILHA", "ESPORTE", "TURISMO"]);
});

test("ehExperiencia e ehAtividade só aceitam os valores exatos", () => {
  for (const valor of EXPERIENCIAS) assert.equal(ehExperiencia(valor), true);
  for (const valor of ATIVIDADES) assert.equal(ehAtividade(valor), true);
  for (const valor of ["iniciante", "", " INICIANTE", null, undefined, 1, [], {}, "PASSEIO"]) {
    assert.equal(ehExperiencia(valor), false, String(valor));
  }
  for (const valor of ["passeio", "", " PASSEIO", null, undefined, 1, [], {}, "INICIANTE"]) {
    assert.equal(ehAtividade(valor), false, String(valor));
  }
});

test("alturaValida: inteiro de 100 a 250", () => {
  assert.equal(ALTURA_MIN_CM, 100);
  assert.equal(ALTURA_MAX_CM, 250);
  for (const valor of [100, 172, 250]) assert.equal(alturaValida(valor), true, String(valor));
  for (const valor of [99, 251, 172.5, NaN, Infinity, -1, 0, "172", null, undefined, true, []]) {
    assert.equal(alturaValida(valor), false, String(valor));
  }
});
