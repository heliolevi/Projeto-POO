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

async function errosDaRegra(codigo: string, arquivo = "src/shared/qualidade/amostra.ts"): Promise<string[]> {
  const [resultado] = await eslint.lintText(codigo, { filePath: arquivo });
  // um trecho que nem compila não pode passar por "aceito": a regra nem chegaria a rodar
  const fatal = resultado.messages.find((mensagem) => mensagem.fatal);
  if (fatal) throw new Error(`o trecho não compila: ${fatal.message}`);
  return resultado.messages
    .filter((mensagem) => mensagem.ruleId === "no-restricted-syntax")
    .map((mensagem) => mensagem.message);
}

// Todos os erros do lint (de qualquer regra) sobre o trecho: o que `npm run lint` mostraria como erro.
// Só errosDaRegra não basta para "aceito": o nextTs tem outras regras (no-namespace, no-require-imports)
// que também reprovariam um trecho permitido, e o teste não veria.
async function errosDeQualquerRegra(codigo: string, arquivo = "src/shared/qualidade/amostra.ts"): Promise<string[]> {
  const [resultado] = await eslint.lintText(codigo, { filePath: arquivo });
  const fatal = resultado.messages.find((mensagem) => mensagem.fatal);
  if (fatal) throw new Error(`o trecho não compila: ${fatal.message}`);
  return resultado.messages
    .filter((mensagem) => mensagem.severity === 2)
    .map((mensagem) => `${mensagem.ruleId}: ${mensagem.message}`);
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
  // using roda no Node 24, mas não no Node 22 da CI (SyntaxError, conferido): passa na máquina de
  // quem escreveu e quebra na CI. Por depender da versão, fica fora da conferência no Node abaixo.
  using: "function abrir() { return { [Symbol.dispose]() {} }; }\n{ using c = abrir(); }\nexport {};",
  "await using": "async function abrir() { return { async [Symbol.asyncDispose]() {} }; }\n{ await using c = await abrir(); }\nexport {};",
  // declare enum num .ts: o Node apaga a declaração, mas o enum não existe em tempo de execução, e
  // quem usa Cor.Verde quebra (conferido: o tsc do projeto e o lint antigo aceitavam). Num .d.ts ou
  // dentro de declare module, segue permitido.
  "declare enum num .ts": "export declare enum Cor { Verde }",
  "declare const enum num .ts": "export declare const enum Cor { Verde }",
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
  "declare enum dentro de declare module": "declare module 'lib' { enum E { A } }\nexport {};",
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
    // e nenhuma outra regra do lint reprova o trecho (era o que o teste não via)
    assert.deepEqual(await errosDeQualquerRegra(codigo), []);
  });
}

// As listas acima afirmam o que o Node apaga ou não. Aqui cada trecho passa de verdade pelo Node que
// executa o teste (na CI, o Node 22): se uma versão do Node mudar o que consegue apagar, este teste
// avisa. As duas exceções são decisões do projeto: o Node apagaria, mas o projeto reprova.
const ESTRITO_DE_PROPOSITO = new Set([
  "namespace só com tipos",
  "import type x = require",
  // a sintaxe o Node aceita; o problema é o enum não existir quando alguém o usa
  "declare enum num .ts",
  "declare const enum num .ts",
]);
// aceito ou não conforme a versão do Node (ver o comentário em PROIBIDOS)
const DEPENDE_DA_VERSAO = new Set(["using", "await using"]);

// Só a sintaxe interessa, não o que o código faz. A primeira linha do trecho lança uma sentinela: se
// o Node chegou a executá-la, ele aceitou a sintaxe do trecho inteiro, e o resto nunca roda (nenhum
// erro de execução se mistura). Se a sentinela não aparece e há SyntaxError (inclusive o
// ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX), o Node recusou. Qualquer outra coisa (timeout, sinal) não
// prova nada, e o teste falha mostrando o que houve.
const SENTINELA = "__SINTAXE_ACEITA__";
type VeredictoDoNode = "aceita" | "recusa" | { inesperado: string };

function veredictoDoNode(codigo: string): VeredictoDoNode {
  const execucao = spawnSync(
    process.execPath,
    ["--input-type=module-typescript", "--eval", `throw new Error("${SENTINELA}");\n${codigo}`],
    // NODE_OPTIONS vazio: uma opção de quem roda o teste (como --experimental-transform-types) mudaria
    // o que o Node aceita, e a conferência é do type stripping puro
    { encoding: "utf8", timeout: 15_000, env: { ...process.env, NODE_OPTIONS: "" } },
  );
  if (execucao.error || execucao.signal) {
    return { inesperado: `${execucao.error?.message ?? ""} ${execucao.signal ?? ""}`.trim() };
  }
  // a linha do erro lançado ("Error: __SINTAXE_ACEITA__"), e não o eco do código-fonte: quando o Node
  // recusa a sintaxe, ele imprime as linhas em volta do erro, e a da sentinela vem junto
  if (new RegExp(`^Error: ${SENTINELA}$`, "m").test(execucao.stderr)) return "aceita";
  if (/SyntaxError|ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX|ERR_INVALID_TYPESCRIPT_SYNTAX/.test(execucao.stderr)) return "recusa";
  return { inesperado: execucao.stderr.split("\n").find((linha) => /Error/.test(linha)) ?? `status ${execucao.status}` };
}

test("o Node recusa cada trecho de PROIBIDOS (fora as decisões de projeto) e aceita cada um de PERMITIDOS", () => {
  const erradas: string[] = [];
  const conferir = (lista: string, nome: string, esperado: "aceita" | "recusa", codigo: string) => {
    const veredicto = veredictoDoNode(codigo);
    if (veredicto !== esperado) {
      const visto = typeof veredicto === "string" ? veredicto : `resultado inesperado: ${veredicto.inesperado}`;
      erradas.push(`${lista} "${nome}": esperava "${esperado}", veio ${visto}`);
    }
  };
  for (const [nome, codigo] of Object.entries(PROIBIDOS)) {
    if (DEPENDE_DA_VERSAO.has(nome)) continue;
    conferir("PROIBIDOS", nome, ESTRITO_DE_PROPOSITO.has(nome) ? "aceita" : "recusa", codigo);
  }
  for (const [nome, codigo] of Object.entries(PERMITIDOS)) conferir("PERMITIDOS", nome, "aceita", codigo);
  assert.deepEqual(erradas, []);
});

test("um erro em tempo de execução não conta como o Node recusando a sintaxe", () => {
  assert.equal(veredictoDoNode("export const a = 1;"), "aceita");
  assert.equal(veredictoDoNode("export enum E { A }"), "recusa");
  // SyntaxError em tempo de execução (JSON quebrado) não é recusa de sintaxe: o código nem roda
  assert.equal(veredictoDoNode("export const x: unknown = JSON.parse('{');"), "aceita");
  assert.equal(veredictoDoNode("throw new ReferenceError('x');"), "aceita");
});

// A regra vale para .ts, .tsx, .mts e .cts (e não para .d.ts, que é todo ambiente). Se o `files` ou
// o `ignores` do eslint.config.mjs mudarem, estes casos acusam.
test("a regra vale em .ts, .tsx, .mts e .cts, dentro e fora de src", async () => {
  // inclui caminhos em src/modules e src/app: um bloco posterior que trocasse o no-restricted-syntax
  // dessas pastas apagaria a regra ali, e este teste acusaria
  for (const arquivo of ["src/x.tsx", "src/x.mts", "src/x.cts", "scripts/x.ts", "x.config.ts", "src/modules/reservas/domain/x.ts", "src/app/app/x/page.tsx"]) {
    assert.equal((await errosDaRegra("export enum E { A }", arquivo)).length, 1, arquivo);
  }
});

test("arquivo de declaração não passa pela regra (é todo ambiente): .d.ts, .d.mts e .d.cts", async () => {
  for (const arquivo of ["src/tipos.d.ts", "src/tipos.d.mts", "src/tipos.d.cts"]) {
    assert.deepEqual(await errosDaRegra("export enum E { A }", arquivo), [], arquivo);
  }
});

// O tsc trata qualquer *.d.<algo>.ts como declaração (conferido), inclusive um "pedido.d.test.ts", que
// o npm test executa: o lint é a única barreira para esses nomes, então eles não ficam de fora.
test("um arquivo com .d. no meio do nome (pedido.d.test.ts) continua passando pela regra", async () => {
  for (const arquivo of ["src/pedido.d.test.ts", "src/estilos/botao.d.css.ts"]) {
    assert.equal((await errosDaRegra("export enum E { A }", arquivo)).length, 1, arquivo);
  }
});

test("a fronteira entre módulos vale também para o import type de um .cts", async () => {
  const [resultado] = await eslint.lintText("import type { X } from '@/modules/reservas/domain/x';\nexport type Y = X;", {
    filePath: "src/app/x.cts",
  });
  assert.ok(resultado.messages.some((m) => m.ruleId === "no-restricted-imports"), JSON.stringify(resultado.messages));
});

test("a conferência no Node ignora o NODE_OPTIONS de quem roda o teste", () => {
  const antes = process.env.NODE_OPTIONS;
  // com --experimental-transform-types o Node transformaria o enum em vez de recusar
  process.env.NODE_OPTIONS = "--experimental-transform-types";
  try {
    assert.equal(veredictoDoNode("export enum E { A }"), "recusa");
  } finally {
    if (antes === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = antes;
  }
});

// Segunda barreira: o próprio TypeScript (job typecheck) recusa a sintaxe não apagável em todo .ts
// do projeto, inclusive fora de src (next.config.ts). Apagar a opção do tsconfig faz este teste falhar.
// O tsconfig é JSONC (aceita comentário e vírgula sobrando): é lido com o leitor do TypeScript.
test("o tsconfig liga erasableSyntaxOnly e verbatimModuleSyntax", () => {
  const caminho = `${RAIZ}tsconfig.json`;
  const { config, error } = ts.parseConfigFileTextToJson(caminho, readFileSync(caminho, "utf8"));
  assert.equal(error, undefined);
  assert.equal(config.compilerOptions?.erasableSyntaxOnly, true);
  // O mesmo tipo de quebra por outro caminho: um tipo importado sem `type` fica no código que o Node
  // roda, e o `npm test` falha com "does not provide an export named". verbatimModuleSyntax obriga o
  // `import type` (o código atual já seguia: ligar a opção não pediu nenhuma mudança).
  assert.equal(config.compilerOptions?.verbatimModuleSyntax, true);
});

// A opção existe a partir do TypeScript 5.8: a faixa do package.json não pode aceitar uma versão sem ela.
// Vale a menor versão que a faixa aceita (o primeiro número dela: "^5.8", ">=5.8", "~5.9", "^6");
// "x" ou parte ausente contam como 0 ("5.x" aceita a 5.0 e é recusada). Faixas com limite de cima ou
// alternativas ("<6", "a || b", "a - b") não têm o mínimo no primeiro número: são recusadas, para o
// teste nunca aprovar uma faixa que não entende.
function menorVersaoDaFaixa(faixa: string): [number, number] {
  if (/<|\|\||\s-\s/.test(faixa)) throw new Error(`faixa de versão que o teste não sabe ler: ${faixa}`);
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
  for (const faixa of ["<6", "<=5.9", "^5.8 || ^4.9", "4.9 - 5.9"]) {
    assert.throws(() => menorVersaoDaFaixa(faixa), /não sabe ler/, faixa);
  }
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
