import type { Dinheiro } from "../../../shared/dominio/dinheiro.ts";
import { Ocorrencia, type DadosBaseOcorrencia } from "./ocorrencia.ts";

export type DadosFurto = DadosBaseOcorrencia & {
  // Valor de reposição, quando alguém o estimou; sem ele, a cobrança é a caução.
  custoEstimado?: Dinheiro | null;
  caucao: Dinheiro;
};

// Furto da bicicleta: sem estimativa, sugere cobrar a caução inteira.
export class Furto extends Ocorrencia {
  readonly #custoEstimado: Dinheiro | null;
  readonly #caucao: Dinheiro;

  constructor(dados: DadosFurto) {
    super(dados);
    this.#custoEstimado = dados.custoEstimado ?? null;
    this.#caucao = dados.caucao;
  }

  get tipo(): "FURTO" {
    return "FURTO";
  }
  get custoEstimado(): Dinheiro | null {
    return this.#custoEstimado;
  }
  get caucao(): Dinheiro {
    return this.#caucao;
  }

  valorSugerido(): Dinheiro {
    return this.#custoEstimado ?? this.#caucao;
  }
}
