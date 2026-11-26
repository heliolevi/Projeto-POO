// As variáveis de ambiente do processo. As variáveis entram pelo construtor (nos testes, um objeto
// qualquer); `Ambiente.padrao` lê o process.env de verdade.
export class Ambiente {
  static readonly padrao = new Ambiente(process.env);

  readonly #variaveis: Readonly<Record<string, string | undefined>>;

  constructor(variaveis: Readonly<Record<string, string | undefined>>) {
    this.#variaveis = variaveis;
  }

  /** O valor da variável, ou lança se ela não existir ou estiver vazia. */
  exigir(nome: string): string {
    const valor = this.#variaveis[nome];
    if (!valor) {
      throw new Error(`Variável de ambiente ausente: ${nome}`);
    }
    return valor;
  }

  /** O valor da variável, ou undefined se ela não existir ou estiver vazia. */
  opcional(nome: string): string | undefined {
    return this.#variaveis[nome] || undefined;
  }
}
