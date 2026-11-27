import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { ESLint } from "eslint";

// B3: o lint tem de reprovar a sintaxe de TypeScript que o Node não apaga (o `npm test` roda os .ts
// direto, sem compilar). O teste usa a configuração de verdade (eslint.config.mjs) sobre trechos de
// código, então uma regra apagada ou afrouxada na configuração faz este teste falhar.
const eslint = new ESLint({ cwd: process.cwd() });

async function errosDaRegra(codigo: string): Promise<string[]> {
  const [resultado] = await eslint.lintText(codigo, {
    filePath: "src/shared/qualidade/amostra.ts",
  });
  return resultado.messages
    .filter((mensagem) => mensagem.ruleId === "no-restricted-syntax")
    .map((mensagem) => mensagem.message);
}

const PROIBIDOS: Record<string, string> = {
  "constructor(private x)": "export class A { constructor(private x: number) {} }",
  "constructor(public x)": "export class A { constructor(public x: number) {} }",
  "constructor(readonly x)": "export class A { constructor(readonly x: number) {} }",
  enum: "export enum Cor { Verde, Azul }",
  "const enum": "export const enum Cor { Verde }",
  namespace: "export namespace Util { export const a = 1; }",
  "import x = require": "import fs = require('node:fs');",
  "export =": "const a = 1; export = a;",
};

for (const [nome, codigo] of Object.entries(PROIBIDOS)) {
  test(`o lint reprova ${nome}`, async () => {
    const erros = await errosDaRegra(codigo);
    assert.equal(erros.length, 1, `esperava 1 erro, veio: ${JSON.stringify(erros)}`);
    assert.match(erros[0], /não é apagável/);
  });
}

const PERMITIDOS: Record<string, string> = {
  "campo #privado e construtor privado":
    "export class A { readonly #x: number; private constructor(x: number) { this.#x = x; } get x() { return this.#x; } }",
  "campo com private/readonly declarado no corpo":
    "export class A { private y = 1; readonly z = 2; constructor(x: number) { this.y = x; } }",
  "type e interface": "export type T = { a: 1 }; export interface I { b: 2 }",
  "objeto as const": "export const Cor = { Verde: 'Verde' } as const;",
  "declare namespace (só tipos)": "declare namespace Util { const a: number }",
  "declare global": "declare global { interface Window { x: number } }\nexport {};",
  // declarações ambientes só descrevem tipos: o Node apaga (conferido rodando com node arquivo.ts)
  "declare enum": "declare enum E { A }\nexport {};",
  "declare const enum": "declare const enum E { A }\nexport {};",
  "declare namespace aninhado": "declare namespace A { namespace B { const x: number } }\nexport {};",
  "augmentation de módulo com namespace": "declare module 'lib' { namespace N { const a: number } }\nexport {};",
};

for (const [nome, codigo] of Object.entries(PERMITIDOS)) {
  test(`o lint aceita ${nome}`, async () => {
    assert.deepEqual(await errosDaRegra(codigo), []);
  });
}

// Segunda barreira: o próprio TypeScript (job typecheck) recusa a sintaxe não apagável em todo .ts
// do projeto, inclusive fora de src (next.config.ts). Apagar a opção do tsconfig faz este teste falhar.
test("o tsconfig liga erasableSyntaxOnly", () => {
  const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8"));
  assert.equal(tsconfig.compilerOptions?.erasableSyntaxOnly, true);
});
