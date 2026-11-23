import type { Dinheiro } from "../../../shared/dominio/dinheiro.ts";
import { Ocorrencia, type DadosBaseOcorrencia } from "./ocorrencia.ts";

export type DadosDano = DadosBaseOcorrencia & {
  // Estimativa do conserto ou da reposição, feita por quem abriu a ocorrência.
  custoEstimado: Dinheiro;
};

// Dano à bicicleta: sugere cobrar o custo estimado do conserto.
export class Dano extends Ocorrencia {
  readonly #custoEstimado: Dinheiro;

  constructor(dados: DadosDano) {
    super(dados);
    this.#custoEstimado = dados.custoEstimado;
  }

  get tipo(): "DANO" {
    return "DANO";
  }
  get custoEstimado(): Dinheiro {
    return this.#custoEstimado;
  }

  valorSugerido(): Dinheiro {
    return this.#custoEstimado;
  }
}
