import { horasDaDuracao } from "./preco-aluguel.ts";

// Objeto de valor: um intervalo de tempo [inicio, fim) com início antes do fim.
//
// Encapsulamento: os limites são privados e as datas devolvidas são cópias, então ninguém altera
// o período por fora. É estruturalmente compatível com `{ inicio, fim }`, o formato que a regra
// de preço (calcularValorAluguel) já recebe.
export class Periodo {
  readonly #inicio: number;
  readonly #fim: number;

  private constructor(inicio: number, fim: number) {
    this.#inicio = inicio;
    this.#fim = fim;
  }

  static de(inicio: Date, fim: Date): Periodo {
    const i = inicio.getTime();
    const f = fim.getTime();
    // "!(f > i)" também recusa NaN, que vem de uma Date inválida
    if (Number.isNaN(i) || Number.isNaN(f) || !(f > i)) {
      throw new RangeError("O fim precisa ser depois do início, e as duas datas precisam ser válidas.");
    }
    return new Periodo(i, f);
  }

  get inicio(): Date {
    return new Date(this.#inicio);
  }

  get fim(): Date {
    return new Date(this.#fim);
  }

  get duracaoMs(): number {
    return this.#fim - this.#inicio;
  }

  // Horas arredondadas para cima: qualquer fração conta como hora cheia (a regra de cobrança, que
  // mora em preco-aluguel.ts).
  get horasCobradas(): number {
    return horasDaDuracao(this.duracaoMs);
  }

  // Dois períodos se sobrepõem quando cada um começa antes de o outro terminar. Encostar não conta:
  // um aluguel que termina às 12h não conflita com outro que começa às 12h (o mesmo sentido do
  // tstzrange [) da exclusion constraint do banco).
  sobrepoe(outro: Periodo): boolean {
    return this.#inicio < outro.#fim && outro.#inicio < this.#fim;
  }

  contem(instante: Date): boolean {
    const t = instante.getTime();
    return t >= this.#inicio && t < this.#fim;
  }

  // Novo período com o mesmo início e outro fim (usado para estender um aluguel).
  comNovoFim(novoFim: Date): Periodo {
    return Periodo.de(new Date(this.#inicio), novoFim);
  }

  igual(outro: Periodo): boolean {
    return this.#inicio === outro.#inicio && this.#fim === outro.#fim;
  }

  toJSON(): { inicio: string; fim: string } {
    return { inicio: new Date(this.#inicio).toISOString(), fim: new Date(this.#fim).toISOString() };
  }
}
