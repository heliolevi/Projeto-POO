import { Dinheiro } from "../../../shared/dominio/dinheiro.ts";
import { CalculadoraDeAluguel, type Precos } from "../../../shared/dominio/preco-aluguel.ts";
import { Ocorrencia, type DadosBaseOcorrencia } from "./ocorrencia.ts";

// Regra assumida (docs/dados-da-locadora.md, seção 6): até 15 minutos de atraso não se cobra.
export const TOLERANCIA_DE_ATRASO_MS = 15 * 60 * 1000;

export type DadosAtraso = DadosBaseOcorrencia & {
  // Quando a reserva terminava (já ajustado à abertura do ponto, se ele estava fechado).
  fimPrevisto: Date;
  devolvidoEm: Date;
  // Os preços do tipo da bicicleta: o atraso é cobrado pela mesma conta do aluguel.
  precos: Precos;
};

// Devolução fora do prazo. Passada a tolerância, todo o atraso é cobrado em horas cheias (hora
// iniciada conta como hora cheia) pelo preço por hora do tipo, e a cada 24 horas não passa de uma
// diária. É a mesma conta do aluguel (valorPorHoras).
export class Atraso extends Ocorrencia {
  readonly #fimPrevisto: Date;
  readonly #devolvidoEm: Date;
  readonly #precos: Precos;

  constructor(dados: DadosAtraso) {
    super(dados);
    if (Number.isNaN(dados.fimPrevisto.getTime()) || Number.isNaN(dados.devolvidoEm.getTime())) {
      throw new RangeError("As datas do atraso precisam ser válidas.");
    }
    this.#fimPrevisto = new Date(dados.fimPrevisto);
    this.#devolvidoEm = new Date(dados.devolvidoEm);
    this.#precos = { ...dados.precos };
  }

  get tipo(): "ATRASO" {
    return "ATRASO";
  }
  get fimPrevisto(): Date {
    return new Date(this.#fimPrevisto);
  }
  get devolvidoEm(): Date {
    return new Date(this.#devolvidoEm);
  }

  // Duração do atraso em milissegundos (zero se devolveu no prazo ou antes).
  duracaoDoAtrasoMs(): number {
    return Math.max(0, this.#devolvidoEm.getTime() - this.#fimPrevisto.getTime());
  }

  valorSugerido(): Dinheiro {
    const atrasoMs = this.duracaoDoAtrasoMs();
    if (atrasoMs <= TOLERANCIA_DE_ATRASO_MS) return Dinheiro.ZERO;
    return Dinheiro.deCentavos(CalculadoraDeAluguel.padrao.valorPorHoras(CalculadoraDeAluguel.padrao.horasDaDuracao(atrasoMs), this.#precos));
  }
}
