import { readdirSync } from "node:fs";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Módulos existentes em src/modules (lidos do disco: módulo novo já entra na regra).
const modulos = readdirSync(new URL("./src/modules", import.meta.url), {
  withFileTypes: true,
})
  .filter((entrada) => entrada.isDirectory())
  .map((entrada) => entrada.name);

// Imports que passam por dentro de um módulo (@/modules/<modulo>/...), seja pelo
// alias ou por caminho relativo (../modules/<modulo>/...).
const importaInternosDeModulo = [
  {
    regex: "^@/modules/[^/]+/.+",
    message:
      "Importe o módulo apenas pela sua API pública (@/modules/<modulo>).",
  },
  {
    regex: "^\\.{1,2}/(.*/)?modules/[^/]+/.+",
    message:
      "Importe o módulo apenas pela sua API pública (@/modules/<modulo>), sem caminho relativo para dentro dele.",
  },
];

// Dentro do módulo "atual": caminhos relativos só valem para o próprio módulo.
// Chegar em outro módulo exige o alias público (@/modules/<outro>).
function patternsDoModulo(atual) {
  const outros = modulos.filter((nome) => nome !== atual);
  return [
    ...importaInternosDeModulo,
    {
      regex: "^\\.{1,2}/(.*/)?modules(/|$)",
      message: "Para outro módulo, importe @/modules/<modulo>.",
    },
    ...(outros.length > 0
      ? [
          {
            regex: `^(\\.\\./)+(${outros.join("|")})(/|$)`,
            message: "Para outro módulo, importe @/modules/<modulo>.",
          },
        ]
      : []),
  ];
}

// Sintaxe de TypeScript que o Node NÃO consegue apagar ao rodar um .ts direto (type stripping, que
// é como `npm test` executa o código): ela gera JavaScript, então o Node falha ou o código muda de
// comportamento. Tipos, interfaces, `private`/`readonly` em campo e `#campo` são apagáveis e
// continuam liberados. Cada regra diz o que escrever no lugar.
//
// Declarações ambientes (`declare enum`, `declare namespace`, `declare module`, e o que estiver
// dentro delas) só descrevem tipos e o Node as apaga: ficam liberadas. O nó de dentro de um
// `declare namespace` não tem `declare=true`, por isso o seletor também olha os ancestrais.
// O TypeScript (`erasableSyntaxOnly` no tsconfig) confere de novo enum, namespace, parameter
// property, `import =`, `export =` e `<T>x` em todo .ts do projeto, inclusive fora de src (como o
// next.config.ts). Decorator e `accessor` ele não pega: esses só o lint barra.
const DENTRO_DE_DECLARE = "TSModuleDeclaration[declare=true] *";

const sintaxeNaoApagavel = [
  {
    selector: "TSParameterProperty",
    message:
      "Propriedade de parâmetro (constructor(private x)) não é apagável. Declare o campo (readonly #x) e atribua no corpo do construtor.",
  },
  {
    selector: `TSEnumDeclaration:not([declare=true]):not(${DENTRO_DE_DECLARE})`,
    message:
      "enum não é apagável. Use um objeto `as const` com um tipo união: const X = { A: \"A\" } as const.",
  },
  {
    selector: `TSModuleDeclaration:not([declare=true]):not(${DENTRO_DE_DECLARE})`,
    // Decisão do projeto: reprovado mesmo só com tipos (aí o Node apagaria, mas o projeto não usa
    // namespace e a regra fica simples).
    message:
      "namespace/module fora de `declare` não é apagável quando tem código, e o projeto não usa nem só com tipos. Use um arquivo (módulo ES), `export type` ou um objeto no lugar.",
  },
  {
    // `import type x = require(...)` também: o Node apagaria, mas o TypeScript com
    // erasableSyntaxOnly recusa, e o lint acompanha o tsc.
    selector: `TSImportEqualsDeclaration:not(${DENTRO_DE_DECLARE})`,
    message:
      "`import x = ...` não é apagável. Para um módulo, use `import x from \"...\"` (num .cts, que roda como CommonJS, `const x = require(\"...\")`); para um apelido (`import T = N.Y`), use `type T = N.Y` ou uma `const`.",
  },
  {
    // `accessor` é sintaxe de JavaScript que o V8 ainda não roda (o tsc não pega). Sem corpo de
    // execução ele é apagável: o abstrato (outro nó, que fica de fora) e o de uma classe `declare`.
    selector: `AccessorProperty:not(ClassDeclaration[declare=true] *):not(${DENTRO_DE_DECLARE})`,
    message:
      "Campo `accessor` não é apagável: o Node não roda essa sintaxe e o `npm test` quebra com SyntaxError. Use um campo `#x` com get/set.",
  },
  {
    selector: "TSTypeAssertion",
    message: "Asserção `<T>x` não é apagável: o Node não aceita esse formato. Use `x as T`.",
  },
  {
    // `using` e `await using` rodam no Node 24, mas não no Node 22 da CI (SyntaxError): passariam na
    // máquina de quem escreveu e quebrariam na CI.
    selector: 'VariableDeclaration[kind="using"], VariableDeclaration[kind="await using"]',
    message:
      "`using` não é apagável no Node 22 da CI: o `npm test` quebra com SyntaxError lá. Use try/finally para liberar o recurso.",
  },
  {
    // decorator é sintaxe de JavaScript que o V8 ainda não roda: com type stripping o Node dá
    // SyntaxError. O tsc com erasableSyntaxOnly não pega este caso, então ele mora só aqui.
    selector: "Decorator",
    message:
      "Decorator não é apagável: o Node não roda essa sintaxe e o `npm test` quebra com SyntaxError. Chame a função direto no lugar.",
  },
  {
    selector: `TSExportAssignment:not(${DENTRO_DE_DECLARE})`,
    message: "`export = x` não é apagável. Use `export default x` ou `export { x }` (num .cts, `module.exports = x`).",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Sintaxe não apagável: vale para todo TypeScript do projeto (src, scripts, next.config.ts...).
    // Um .d.ts é todo ambiente. .next, out e build já ficam de fora pelos globalIgnores.
    files: ["**/*.{ts,tsx,mts,cts}"],
    // Só as formas reais de declaração. Um *.d.<algo>.ts (como pedido.d.test.ts) o tsc também trata
    // como declaração, mas o npm test executa: aqui o lint é a única barreira, e ele não fica de fora.
    ignores: ["**/*.d.ts", "**/*.d.mts", "**/*.d.cts"],
    rules: {
      "no-restricted-syntax": ["error", ...sintaxeNaoApagavel],
    },
  },
  {
    // Fronteiras entre módulos: outros módulos e rotas só importam pelo index.ts.
    // Em .cts, o import type é conferido; um require(...) não (no-restricted-imports não olha require).
    files: ["src/**/*.{ts,tsx,mts,cts}"],
    ignores: ["src/modules/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: importaInternosDeModulo },
      ],
    },
  },
  ...modulos.map((modulo) => ({
    files: [`src/modules/${modulo}/**/*.{ts,tsx,mts,cts}`],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: patternsDoModulo(modulo) },
      ],
    },
  })),
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
