export type RequisitoDaSenha = { id: "tamanho" | "letra" | "numero"; texto: string; ok: boolean };

// As regras da senha do cadastro, as mesmas que a API confere: de 8 a 128 caracteres, com ao menos
// uma letra (A a Z, sem acento) e um número. A tela mostra cada requisito sendo cumprido enquanto a
// pessoa digita; a API usa a mesma política para recusar. Os limites entram pelo construtor.
export class PoliticaDeSenha {
  static readonly TAMANHO_MINIMO = 8;
  static readonly TAMANHO_MAXIMO = 128;

  readonly #min: number;
  readonly #max: number;

  constructor(min: number = PoliticaDeSenha.TAMANHO_MINIMO, max: number = PoliticaDeSenha.TAMANHO_MAXIMO) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
      throw new RangeError("O tamanho da senha precisa ir de um mínimo inteiro até um máximo maior ou igual a ele.");
    }
    this.#min = min;
    this.#max = max;
  }

  get min(): number {
    return this.#min;
  }

  get max(): number {
    return this.#max;
  }

  tamanhoValido(senha: string): boolean {
    return senha.length >= this.#min && senha.length <= this.#max;
  }

  requisitos(senha: string): RequisitoDaSenha[] {
    return [
      { id: "tamanho", texto: `${this.#min} caracteres ou mais`, ok: this.tamanhoValido(senha) },
      { id: "letra", texto: "Uma letra", ok: /[A-Za-z]/.test(senha) },
      { id: "numero", texto: "Um número", ok: /\d/.test(senha) },
    ];
  }

  aceita(senha: string): boolean {
    return this.requisitos(senha).every((r) => r.ok);
  }
}
