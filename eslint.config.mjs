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
// A mesma regra é conferida pelo TypeScript (`erasableSyntaxOnly` no tsconfig), que cobre também os
// .ts fora de src (como o next.config.ts).
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
    message: "`import x = require(...)` não é apagável. Use `import x from \"...\"`.",
  },
  {
    selector: `TSExportAssignment:not(${DENTRO_DE_DECLARE})`,
    message: "`export = x` não é apagável. Use `export default x` ou `export { x }`.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Sintaxe não apagável: vale para todo o código-fonte em TypeScript. Um .d.ts é todo ambiente.
    files: ["src/**/*.{ts,tsx,mts,cts}"],
    ignores: ["**/*.d.ts", "**/*.d.mts", "**/*.d.cts"],
    rules: {
      "no-restricted-syntax": ["error", ...sintaxeNaoApagavel],
    },
  },
  {
    // Fronteiras entre módulos: outros módulos e rotas só importam pelo index.ts.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/modules/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: importaInternosDeModulo },
      ],
    },
  },
  ...modulos.map((modulo) => ({
    files: [`src/modules/${modulo}/**/*.{ts,tsx}`],
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
