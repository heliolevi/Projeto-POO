// Regra de preço do aluguel. É a única: a recomendação (GET /api/recomendacao) e a criação da
// reserva (POST /api/reservas) usam esta mesma função, porque o valor é sempre calculado no
// servidor e nunca pode divergir entre a vitrine e a cobrança (docs/contrato-api-mvp.md).
//
// Regra assumida (o projeto usa dados fictícios, sem locadora real; reavaliar quando houver):
// - as horas são arredondadas para cima (3 h 10 min contam como 4 horas);
// - cada bloco completo de 24 horas custa o preço por dia;
// - as horas que sobram custam o preço por hora, mas nunca mais que um dia.
// Assim 25 horas são 1 dia + 1 hora, e alugar por hora nunca sai mais caro que alugar pelo dia.
//
// Tudo em centavos inteiros. A conta só usa inteiros (resto e divisão exata), nunca ponto
// flutuante.

const MS_POR_HORA = 60 * 60 * 1000;
const HORAS_POR_DIA = 24;

export type PeriodoCobravel = { inicio: Date; fim: Date };
export type Precos = { precoHoraCentavos: number; precoDiaCentavos: number };

/**
 * A regra de preço do aluguel. Não guarda estado: os preços chegam a cada conta, porque cada tipo
 * de bicicleta tem os seus. Quem precisa dela recebe uma instância (pelo construtor); o app usa
 * `CalculadoraDeAluguel.padrao`.
 */
export class CalculadoraDeAluguel {
  /** A do app. */
  static readonly padrao = new CalculadoraDeAluguel();

  /** Horas de uma duração em milissegundos, arredondadas para cima (qualquer fração conta como hora cheia). */
  horasDaDuracao(duracaoMs: number): number {
    const fracaoMs = duracaoMs % MS_POR_HORA;
    return (duracaoMs - fracaoMs) / MS_POR_HORA + (fracaoMs > 0 ? 1 : 0);
  }

  /** Horas cobradas do período, arredondadas para cima (qualquer fração conta como hora cheia). */
  horasCobradas({ inicio, fim }: PeriodoCobravel): number {
    const duracaoMs = fim.getTime() - inicio.getTime();
    // "!(x > 0)" também recusa NaN, que vem de Date inválida
    if (!(duracaoMs > 0)) {
      throw new RangeError("O fim precisa ser depois do início, e as duas datas precisam ser válidas.");
    }
    return this.horasDaDuracao(duracaoMs);
  }

  /** Valor de um número de horas cobradas: uma diária por bloco de 24 h, mais as horas que sobram (até uma diária). */
  valorPorHoras(horas: number, precos: Precos): number {
    this.#exigirPrecos(precos);
    return this.#somarHoras(horas, precos);
  }

  /** Valor do aluguel em centavos: uma diária por bloco de 24 h, mais as horas que sobram (até uma diária). */
  calcularValorAluguel(periodo: PeriodoCobravel, precos: Precos): number {
    this.#exigirPrecos(precos);
    return this.#somarHoras(this.horasCobradas(periodo), precos);
  }

  #exigirPrecos(precos: Precos): void {
    this.#exigirPrecoValido("precoHoraCentavos", precos.precoHoraCentavos);
    this.#exigirPrecoValido("precoDiaCentavos", precos.precoDiaCentavos);
  }

  #exigirPrecoValido(nome: string, valor: number): void {
    // isSafeInteger já recusa NaN, Infinity, decimais e qualquer coisa que não seja número
    if (!Number.isSafeInteger(valor) || valor < 0) {
      throw new RangeError(`${nome} precisa ser um inteiro em centavos, maior ou igual a zero.`);
    }
  }

  // A conta em si, sobre horas já arredondadas e preços já validados.
  #somarHoras(horas: number, precos: Precos): number {
    const horasQueSobram = horas % HORAS_POR_DIA;
    const diasCompletos = (horas - horasQueSobram) / HORAS_POR_DIA;

    const valor =
      diasCompletos * precos.precoDiaCentavos +
      Math.min(horasQueSobram * precos.precoHoraCentavos, precos.precoDiaCentavos);
    // Um produto acima de 2^53 perde a exatidão e arredonda para cima: se a soma passou de 2^53,
    // o valor não é confiável. Melhor recusar do que cobrar errado.
    if (!Number.isSafeInteger(valor)) {
      throw new RangeError("O valor do aluguel excede o maior inteiro seguro.");
    }
    return valor;
  }
}
