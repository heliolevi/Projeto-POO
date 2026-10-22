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

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
