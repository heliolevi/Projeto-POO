// Aceita só caminhos internos. Barra "//host" e também "/\host", que alguns navegadores
// tratam como "//host" e levariam o usuário para fora do site depois do login.
export function destinoSeguro(next: string | null, padrao = "/app"): string {
  if (!next || !next.startsWith("/")) return padrao;
  if (next.startsWith("//") || next.includes("\\")) return padrao;
  return next;
}
