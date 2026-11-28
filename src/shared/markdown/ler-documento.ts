import { readFileSync } from "node:fs";
import path from "node:path";

// Lê um documento de docs/ em tempo de build (as páginas são estáticas), então o texto
// que o cliente aceita é o mesmo que está versionado no repositório. Só tem método estático
// (não guarda estado), então não se cria instância.
export class DocumentosDoRepositorio {
  private constructor() {
    throw new Error("DocumentosDoRepositorio só tem métodos estáticos.");
  }

  static ler(arquivo: "termos-de-uso.md" | "politica-de-privacidade.md"): string {
    return readFileSync(path.join(process.cwd(), "docs", arquivo), "utf8");
  }
}
