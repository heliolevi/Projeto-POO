import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
        {
          patterns: [
            {
              regex: "^@/modules/[^/]+/.+",
              message:
                "Importe o módulo apenas pela sua API pública (@/modules/<modulo>).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/modules/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@/modules/[^/]+/.+",
              message:
                "Dentro de um módulo use caminhos relativos; para outro módulo, importe @/modules/<modulo>.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
