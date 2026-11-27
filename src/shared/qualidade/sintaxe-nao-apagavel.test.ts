import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import ts from "typescript";

// B3: o lint tem de reprovar a sintaxe de TypeScript que o Node não apaga (o `npm test` roda os .ts
// direto, sem compilar). O teste usa a configuração de verdade (eslint.config.mjs) sobre trechos de
// código, então uma regra apagada ou afrouxada na configuração faz este teste falhar.
// A raiz vem do próprio arquivo, e não do diretório de onde o teste foi chamado.
const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const eslint = new ESLint({ cwd: RAIZ });

async function errosDaRegra(codigo: string): Promise<string[]> {
  const [resultado] = await eslint.lintText(codigo, {
    filePath: "src/shared/qualidade/amostra.ts",
  });
  // um trecho que nem compila não pode passar por "aceito": a regra nem chegaria a rodar
  const fatal = resultado.messages.find((mensagem) => mensagem.fatal);
  if (fatal) throw new Error(`o trecho não compila: ${fatal.message}`);
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
  // decisão do projeto: namespace fora de declare é reprovado mesmo só com tipos (o Node apagaria,
  // mas o projeto não usa namespace; use um arquivo ou export type)
  "namespace só com tipos": "export namespace Api { export type Resposta = { ok: boolean } }",
  // o Node apagaria, mas o TypeScript com erasableSyntaxOnly recusa (TS1294): o lint acompanha o tsc
  "import type x = require": "import type Fs = require('node:fs');\nexport type T = Fs.Stats;",
  // decorator é sintaxe de JavaScript que o V8 ainda não roda: com type stripping, o Node dá
  // SyntaxError (conferido). Nem o tsc com erasableSyntaxOnly pega este caso; só o lint.
  decorator: "function d(..._a: unknown[]) {}\n@d export class A {}",
  // accessor: o Node dá SyntaxError e o tsc com erasableSyntaxOnly não pega (conferido)
  accessor: "export class A { accessor x = 1 }",
  // <T>x: o Node recusa no type stripping (use x as T); o tsc também recusa
  "<T>x": "const v: unknown = 1;\nexport const n = <number>v;",
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
  // tipando um pacote CommonJS sem tipos: dentro de declare module, export = e import = são ambientes
  "export = dentro de declare module": "declare module 'lib-legada' { function f(): void; export = f; }\nexport {};",
  "import = dentro de declare module": "declare module 'lib-dois' { import fs = require('node:fs'); }\nexport {};",
  // accessor sem corpo de execução: abstrato ou numa classe declare, o Node apaga (conferido)
  "abstract accessor": "export abstract class C { abstract accessor z: number }",
  "accessor em declare class": "declare class B { accessor y: number }\nexport {};",
};

test("um trecho que não compila não passa por aceito", async () => {
  await assert.rejects(() => errosDaRegra("declare namespace A { const x: number"), /não compila/);
});

for (const [nome, codigo] of Object.entries(PERMITIDOS)) {
  test(`o lint aceita ${nome}`, async () => {
    assert.deepEqual(await errosDaRegra(codigo), []);
  });
}

// As listas acima afirmam o que o Node apaga ou não. Aqui cada trecho roda de verdade no Node que
// executa o teste (na CI, o Node 22): se uma versão do Node mudar o que consegue apagar, este teste
// avisa. As duas exceções são decisões do projeto: o Node apagaria, mas o projeto reprova.
const ESTRITO_DE_PROPOSITO = new Set(["namespace só com tipos", "import type x = require"]);

function nodeRoda(codigo: string): boolean {
  const execucao = spawnSync(process.execPath, ["--input-type=module-typescript", "--eval", codigo], {
    encoding: "utf8",
    timeout: 15_000,
  });
  return execucao.status === 0;
}

test("o Node recusa cada trecho de PROIBIDOS (fora as decisões de projeto) e roda cada um de PERMITIDOS", () => {
  const erradas: string[] = [];
  for (const [nome, codigo] of Object.entries(PROIBIDOS)) {
    const roda = nodeRoda(codigo);
    if (ESTRITO_DE_PROPOSITO.has(nome) ? !roda : roda) erradas.push(`PROIBIDOS "${nome}": o Node ${roda ? "roda" : "recusa"}`);
  }
  for (const [nome, codigo] of Object.entries(PERMITIDOS)) {
    if (!nodeRoda(codigo)) erradas.push(`PERMITIDOS "${nome}": o Node recusa`);
  }
  assert.deepEqual(erradas, []);
});

// Segunda barreira: o próprio TypeScript (job typecheck) recusa a sintaxe não apagável em todo .ts
// do projeto, inclusive fora de src (next.config.ts). Apagar a opção do tsconfig faz este teste falhar.
// O tsconfig é JSONC (aceita comentário e vírgula sobrando): é lido com o leitor do TypeScript.
test("o tsconfig liga erasableSyntaxOnly", () => {
  const caminho = `${RAIZ}tsconfig.json`;
  const { config, error } = ts.parseConfigFileTextToJson(caminho, readFileSync(caminho, "utf8"));
  assert.equal(error, undefined);
  assert.equal(config.compilerOptions?.erasableSyntaxOnly, true);
});

// A opção existe a partir do TypeScript 5.8: a faixa do package.json não pode aceitar uma versão sem ela.
// Vale a menor versão que a faixa aceita (o primeiro número dela: "^5.8", ">=5.8", "~5.9", "^6");
// "x" ou parte ausente contam como 0 ("5.x" aceita a 5.0 e é recusada).
function menorVersaoDaFaixa(faixa: string): [number, number] {
  const partes = /(\d+)(?:\.(\d+|x|\*))?/i.exec(faixa);
  if (!partes) throw new Error(`faixa de versão ilegível: ${faixa}`);
  return [Number(partes[1]), Number.isNaN(Number(partes[2])) ? 0 : Number(partes[2] ?? 0)];
}

test("a menor versão de cada formato de faixa é lida certo", () => {
  assert.deepEqual(menorVersaoDaFaixa("^5.8"), [5, 8]);
  assert.deepEqual(menorVersaoDaFaixa(">=5.8"), [5, 8]);
  assert.deepEqual(menorVersaoDaFaixa("~5.9.3"), [5, 9]);
  assert.deepEqual(menorVersaoDaFaixa("^6"), [6, 0]);
  assert.deepEqual(menorVersaoDaFaixa("5.x"), [5, 0]);
});

test("o package.json pede um TypeScript que tem erasableSyntaxOnly (5.8 ou mais novo)", () => {
  const pacote = JSON.parse(readFileSync(`${RAIZ}package.json`, "utf8"));
  const [maior, menor] = menorVersaoDaFaixa(String(pacote.devDependencies.typescript));
  assert.ok(maior > 5 || (maior === 5 && menor >= 8), `typescript ${pacote.devDependencies.typescript}`);
  // e o que está instalado de fato também tem a opção
  const [instMaior, instMenor] = ts.versionMajorMinor.split(".").map(Number);
  assert.ok(instMaior > 5 || (instMaior === 5 && instMenor >= 8), `typescript instalado ${ts.version}`);
});

test("o tsconfig inclui .mts e .cts (a segunda barreira também os confere)", () => {
  const caminho = `${RAIZ}tsconfig.json`;
  const { config } = ts.parseConfigFileTextToJson(caminho, readFileSync(caminho, "utf8"));
  assert.ok(config.include.includes("**/*.mts") && config.include.includes("**/*.cts"), JSON.stringify(config.include));
});
