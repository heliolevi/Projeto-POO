const ORIGEM_FALSA = "http://x.invalid";

// Decide para onde mandar a pessoa depois do login (o ?next= da URL). Aceita só caminhos
// internos; qualquer outra coisa vira o destino padrão. O navegador remove tab e quebra de linha
// ao interpretar uma URL e trata "\" como "/", então "/\t/host" e "/\host" viram "//host" e
// levariam o usuário para fora do site. Por isso, além de barrar caracteres de controle e barra
// invertida, confere no próprio parser de URL se o destino continua na mesma origem.
export class DestinoSeguro {
  readonly #padrao: string;

  constructor(padrao = "/app") {
    this.#padrao = padrao;
  }

  resolver(next: string | null): string {
    if (!next || !next.startsWith("/") || next.startsWith("//")) return this.#padrao;
    if (/[\u0000-\u001f\u007f\\]/.test(next)) return this.#padrao;
    try {
      return new URL(next, ORIGEM_FALSA).origin === ORIGEM_FALSA ? next : this.#padrao;
    } catch {
      return this.#padrao;
    }
  }
}
