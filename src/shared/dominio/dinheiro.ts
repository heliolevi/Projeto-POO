// Objeto de valor: uma quantia em reais guardada em centavos inteiros (nunca em ponto flutuante).
//
// Encapsulamento: o valor é um campo privado e a instância é imutável; toda operação devolve um
// Dinheiro novo. O construtor é privado: só se cria por `deCentavos`, que recusa o que não é
// inteiro seguro e não negativo. Assim nenhuma regra de negócio recebe um valor quebrado.
export class Dinheiro {
  readonly #centavos: number;

  private constructor(centavos: number) {
    this.#centavos = centavos;
  }

  static readonly ZERO = new Dinheiro(0);

  static deCentavos(centavos: number): Dinheiro {
    // isSafeInteger já recusa NaN, Infinity, decimais e qualquer coisa que não seja número
    if (!Number.isSafeInteger(centavos) || centavos < 0) {
      throw new RangeError("O valor em centavos precisa ser um inteiro maior ou igual a zero.");
    }
    return centavos === 0 ? Dinheiro.ZERO : new Dinheiro(centavos);
  }

  get centavos(): number {
    return this.#centavos;
  }

  somar(outro: Dinheiro): Dinheiro {
    return Dinheiro.deCentavos(this.#centavos + outro.#centavos);
  }

  // Recusa resultado negativo: não existe "devolver mais do que se tem".
  subtrair(outro: Dinheiro): Dinheiro {
    if (outro.#centavos > this.#centavos) {
      throw new RangeError("Não é possível subtrair um valor maior do que o valor atual.");
    }
    return Dinheiro.deCentavos(this.#centavos - outro.#centavos);
  }

  // Só por inteiro (quantidade de horas, de diárias): multiplicar por fração geraria centavo quebrado.
  multiplicar(quantidade: number): Dinheiro {
    if (!Number.isSafeInteger(quantidade) || quantidade < 0) {
      throw new RangeError("A quantidade precisa ser um inteiro maior ou igual a zero.");
    }
    return Dinheiro.deCentavos(this.#centavos * quantidade);
  }

  igual(outro: Dinheiro): boolean {
    return this.#centavos === outro.#centavos;
  }

  maiorQue(outro: Dinheiro): boolean {
    return this.#centavos > outro.#centavos;
  }

  menorQue(outro: Dinheiro): boolean {
    return this.#centavos < outro.#centavos;
  }

  // O menor dos dois (por exemplo: o dano é descontado da caução até o limite dela).
  static menor(a: Dinheiro, b: Dinheiro): Dinheiro {
    return a.#centavos <= b.#centavos ? a : b;
  }

  ehZero(): boolean {
    return this.#centavos === 0;
  }

  // "R$ 1.234,50". Montado à mão (sem Intl) para a saída não depender do ambiente.
  formatar(): string {
    const reais = Math.floor(this.#centavos / 100);
    const resto = String(this.#centavos % 100).padStart(2, "0");
    const milhares = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `R$ ${milhares},${resto}`;
  }

  // No JSON da API o dinheiro continua sendo um número em centavos, como o contrato pede.
  toJSON(): number {
    return this.#centavos;
  }

  toString(): string {
    return this.formatar();
  }
}
