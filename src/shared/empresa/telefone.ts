// Telefone como a tela mostra. O banco guarda só os dígitos ("98900000000"), e é isso que
// GET /api/empresa devolve; a tela mostra "(98) 90000-0000". Objeto de valor: os campos são
// privados e não mudam depois de criado.
//
// Só formata o que reconhece como DDD + número (10 dígitos para fixo, 11 para celular, com ou sem
// o +55 na frente). Qualquer outro formato (0800, número curto, texto) sai como veio, sem inventar
// máscara.
export class Telefone {
  readonly #original: string;
  readonly #nacional: string | null;

  private constructor(original: string, nacional: string | null) {
    this.#original = original;
    this.#nacional = nacional;
  }

  /** Devolve null quando não há telefone (ausente, vazio ou só espaços). */
  static de(texto: string | null | undefined): Telefone | null {
    const original = texto?.trim() ?? "";
    if (original === "") return null;
    return new Telefone(original, Telefone.#numeroComDdd(original));
  }

  // Os 10 ou 11 dígitos do número com DDD, ou null se o texto não for um telefone com DDD.
  static #numeroComDdd(texto: string): string | null {
    let digitos = texto.replace(/\D/g, "");
    if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) {
      digitos = digitos.slice(2);
    }
    if (digitos.length !== 10 && digitos.length !== 11) return null;
    // DDD vai de 11 a 99: começar com 0 é 0800, 0300 ou discagem com operadora.
    if (digitos.startsWith("0")) return null;
    return digitos;
  }

  /** "(98) 90000-0000" para celular, "(98) 3222-1100" para fixo; outro formato sai como veio. */
  formatado(): string {
    const numero = this.#nacional;
    if (numero === null) return this.#original;
    const ddd = numero.slice(0, 2);
    const assinante = numero.slice(2);
    const meio = assinante.length - 4;
    return `(${ddd}) ${assinante.slice(0, meio)}-${assinante.slice(meio)}`;
  }

  /** "tel:+5598900000000", para tocar e ligar no celular. Null se o número não foi reconhecido. */
  link(): string | null {
    return this.#nacional === null ? null : `tel:+55${this.#nacional}`;
  }

  toString(): string {
    return this.formatado();
  }

  toJSON(): string {
    return this.formatado();
  }
}
