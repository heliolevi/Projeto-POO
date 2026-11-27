// Objeto de valor: um CNPJ válido (14 dígitos, não todos iguais, com os dois dígitos verificadores
// certos). Só existe por `Cnpj.de`, que aceita o texto com ou sem máscara.
export class Cnpj {
  readonly #digitos: string;

  private constructor(digitos: string) {
    this.#digitos = digitos;
  }

  /** O CNPJ, ou null se o texto não for um CNPJ válido. Aceita "11.222.333/0001-81" e "11222333000181". */
  static de(texto: string): Cnpj | null {
    if (typeof texto !== "string") return null;
    const d = texto.replace(/\D/g, "");
    if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return null;
    const bate = Cnpj.#digito(d.slice(0, 12)) === Number(d[12]) && Cnpj.#digito(d.slice(0, 13)) === Number(d[13]);
    return bate ? new Cnpj(d) : null;
  }

  static #digito(base: string): number {
    let peso = base.length - 7;
    let soma = 0;
    for (const c of base) {
      soma += Number(c) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }

  /** Os 14 dígitos, sem máscara. */
  get digitos(): string {
    return this.#digitos;
  }

  /** "11.222.333/0001-81" */
  formatado(): string {
    const d = this.#digitos;
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }

  igual(outro: Cnpj): boolean {
    return this.#digitos === outro.#digitos;
  }

  toString(): string {
    return this.#digitos;
  }

  toJSON(): string {
    return this.#digitos;
  }
}
