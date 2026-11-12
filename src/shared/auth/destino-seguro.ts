const ORIGEM_FALSA = "http://x.invalid";

// Aceita só caminhos internos. O navegador remove tab e quebra de linha ao interpretar uma
// URL e trata "\" como "/", então "/\t/host" e "/\host" viram "//host" e levariam o usuário
// para fora do site. Por isso, além de barrar caracteres de controle e barra invertida,
// confere no próprio parser de URL se o destino continua na mesma origem.
export function destinoSeguro(next: string | null, padrao = "/app"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return padrao;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return padrao;
  try {
    return new URL(next, ORIGEM_FALSA).origin === ORIGEM_FALSA ? next : padrao;
  } catch {
    return padrao;
  }
}
