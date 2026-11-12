import { readFileSync } from "node:fs";
import path from "node:path";

// Lê um documento de docs/ em tempo de build (as páginas são estáticas), então o texto
// que o cliente aceita é o mesmo que está versionado no repositório.
export function lerDocumento(arquivo: "termos-de-uso.md" | "politica-de-privacidade.md"): string {
  return readFileSync(path.join(process.cwd(), "docs", arquivo), "utf8");
}
