import assert from "node:assert/strict";
import { test } from "node:test";
import { Uuid } from "./uuid.ts";

const BOM = "3f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6f";

test("aceita UUID em qualquer caixa", () => {
  assert.equal(Uuid.ehValido(BOM), true);
  assert.equal(Uuid.ehValido(BOM.toUpperCase()), true);
  assert.equal(Uuid.ehValido("00000000-0000-0000-0000-000000000000"), true);
});

test("recusa o que não é UUID: tamanho, chaves, espaços, quebras de linha, SQL e outros tipos", () => {
  const ruins: unknown[] = [
    "", " ", BOM.slice(1), BOM + "0", ` ${BOM}`, `${BOM} `, `${BOM}\n`, `{${BOM}}`, BOM.replaceAll("-", ""),
    "3f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6g", "1; DROP TABLE usuario", "'; --", "a".repeat(10_000),
    null, undefined, 0, 123, true, {}, [], [BOM], { toString: () => BOM },
  ];
  for (const valor of ruins) assert.equal(Uuid.ehValido(valor), false, String(valor).slice(0, 30));
});

test("serve de guarda de tipo: depois do teste o valor é string", () => {
  const entrada: unknown = BOM;
  if (Uuid.ehValido(entrada)) assert.equal(entrada.length, 36);
  else assert.fail("deveria ser UUID");
});

test("não é instanciável", () => {
  assert.throws(() => new (Uuid as unknown as new () => unknown)(), TypeError);
});
