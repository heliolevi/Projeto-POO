// Objeto de valor: um CPF válido. Só existe por `Cpf.de`, que aceita o texto com ou sem máscara e
// recusa o que tem tamanho errado, dígitos repetidos ou dígito verificador que não bate. Quem tem
// um Cpf nas mãos nunca precisa conferir de novo. É a única implementação do algoritmo: o cadastro
// no navegador e a API usam esta mesma classe.
export class Cpf {
  readonly #digitos: string;

  private constructor(digitos: string) {
    this.#digitos = digitos;
  }

  /** O CPF, ou null se o texto não for um CPF válido. Aceita "529.982.247-25" e "52998224725". */
  static de(texto: string): Cpf | null {
    if (typeof texto !== "string") return null;
    const digitos = Cpf.somenteDigitos(texto);
    return Cpf.#digitoVerificadorConfere(digitos) ? new Cpf(digitos) : null;
  }

  static somenteDigitos(valor: string): string {
    return valor.replace(/\D/g, "");
  }

  /** Máscara enquanto a pessoa digita: "52998224725" vira "529.982.247-25"; o que sobra de 11 dígitos é cortado. */
  static mascarar(valor: string): string {
    return Cpf.somenteDigitos(valor)
      .slice(0, 11)
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }

  static #digitoVerificadorConfere(cpf: string): boolean {
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
    for (const tamanho of [9, 10]) {
      let soma = 0;
      for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i);
      const digito = ((soma * 10) % 11) % 10;
      if (digito !== Number(cpf[tamanho])) return false;
    }
    return true;
  }

  /** Os 11 dígitos, sem máscara (o formato que a API recebe e o banco guarda). */
  get digitos(): string {
    return this.#digitos;
  }

  /** "529.982.247-25" */
  formatado(): string {
    return Cpf.mascarar(this.#digitos);
  }

  igual(outro: Cpf): boolean {
    return this.#digitos === outro.#digitos;
  }

  toString(): string {
    return this.#digitos;
  }

  toJSON(): string {
    return this.#digitos;
  }
}
