import { HorarioDoDia, type HorarioDoPonto } from "./horario-do-dia";
import { LeitorDeObjeto } from "./leitor-de-objeto";

export type LinhaDeHorario = { dias: string; horario: string };

// A semana aparece de segunda a domingo (o banco usa 0 = domingo).
const SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;
const NOME_DO_DIA: Readonly<Record<number, string>> = {
  0: "domingo",
  1: "segunda",
  2: "terça",
  3: "quarta",
  4: "quinta",
  5: "sexta",
  6: "sábado",
};

// Os horários de funcionamento de um ponto, um por dia no máximo. Se o mesmo dia vier duas vezes,
// vale o primeiro. Os dias ficam na ordem da semana (segunda a domingo), qualquer que seja a ordem
// em que chegaram. A grade não muda depois de criada.
export class GradeDeHorarios {
  readonly #dias: readonly HorarioDoDia[];

  constructor(horarios: readonly HorarioDoDia[]) {
    const porDia = new Map<number, HorarioDoDia>();
    for (const horario of horarios) {
      if (!porDia.has(horario.diaSemana)) porDia.set(horario.diaSemana, horario);
    }
    const ordenados: HorarioDoDia[] = [];
    for (const dia of SEMANA) {
      const horario = porDia.get(dia);
      if (horario) ordenados.push(horario);
    }
    this.#dias = ordenados;
  }

  /** Lê o campo `horarios` da resposta. Item inválido é descartado; o que não for lista vira grade vazia. */
  static deResposta(bruto: unknown): GradeDeHorarios {
    const itens = Array.isArray(bruto) ? bruto : [];
    const horarios: HorarioDoDia[] = [];
    for (const item of itens) {
      const horario = HorarioDoDia.deResposta(item);
      if (horario) horarios.push(horario);
    }
    return new GradeDeHorarios(horarios);
  }

  /** Lê o campo `horarios` de dentro de um ponto da resposta. */
  static doPonto(ponto: LeitorDeObjeto): GradeDeHorarios {
    return GradeDeHorarios.deResposta(ponto.bruto("horarios"));
  }

  get vazia(): boolean {
    return this.#dias.length === 0;
  }

  /**
   * Junta os dias seguidos que abrem e fecham na mesma hora: "Segunda a sexta: 08:00 às 18:00".
   * Um dia de folga no meio separa os grupos; domingo não se junta a segunda.
   */
  resumir(): LinhaDeHorario[] {
    const linhas: LinhaDeHorario[] = [];
    let inicio = 0;
    while (inicio < this.#dias.length) {
      let fim = inicio;
      while (fim + 1 < this.#dias.length && this.#seguemNaSemana(fim, fim + 1)) fim += 1;
      linhas.push({
        dias: GradeDeHorarios.#nomeDoGrupo(this.#dias[inicio], this.#dias[fim], fim - inicio + 1),
        horario: this.#dias[inicio].intervalo,
      });
      inicio = fim + 1;
    }
    return linhas;
  }

  // Dois dias da lista ordenada são "seguidos" se ficam lado a lado na semana e têm a mesma hora.
  #seguemNaSemana(a: number, b: number): boolean {
    const posicao = (dia: HorarioDoDia) => SEMANA.indexOf(dia.diaSemana as (typeof SEMANA)[number]);
    return posicao(this.#dias[b]) === posicao(this.#dias[a]) + 1 && this.#dias[a].mesmoIntervaloQue(this.#dias[b]);
  }

  static #nomeDoGrupo(primeiro: HorarioDoDia, ultimo: HorarioDoDia, quantos: number): string {
    const inicial = NOME_DO_DIA[primeiro.diaSemana];
    const maiuscula = inicial.charAt(0).toUpperCase() + inicial.slice(1);
    if (quantos === 7) return "Todos os dias";
    if (quantos === 1) return maiuscula;
    if (quantos === 2) return `${maiuscula} e ${NOME_DO_DIA[ultimo.diaSemana]}`;
    return `${maiuscula} a ${NOME_DO_DIA[ultimo.diaSemana]}`;
  }

  paraDto(): HorarioDoPonto[] {
    return this.#dias.map((dia) => dia.paraDto());
  }

  toJSON(): HorarioDoPonto[] {
    return this.paraDto();
  }
}
