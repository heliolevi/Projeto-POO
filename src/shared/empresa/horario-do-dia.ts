import { LeitorDeObjeto } from "./leitor-de-objeto";

/** Como o horário sai da API (contrato, rota 9). */
export type HorarioDoPonto = { diaSemana: number; abre: string; fecha: string };

const HORA = /^(\d{1,2}):(\d{2})$/;

// O horário de funcionamento de um dia da semana. O objeto só existe válido: dia de 0 a 6
// (0 = domingo, como no banco) e abertura antes do fechamento. Os campos são privados e a hora é
// guardada em minutos, mas sai sempre escrita com dois dígitos ("08:00").
export class HorarioDoDia {
  readonly #diaSemana: number;
  readonly #abre: number;
  readonly #fecha: number;

  constructor(diaSemana: number, abre: string, fecha: string) {
    if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) {
      throw new RangeError("O dia da semana vai de 0 (domingo) a 6 (sábado).");
    }
    const aberturaEmMinutos = HorarioDoDia.#minutos(abre);
    const fechamentoEmMinutos = HorarioDoDia.#minutos(fecha);
    if (aberturaEmMinutos === null || fechamentoEmMinutos === null) {
      throw new RangeError("A hora precisa ter o formato HH:MM, de 00:00 a 23:59.");
    }
    if (fechamentoEmMinutos <= aberturaEmMinutos) {
      throw new RangeError("O horário de abertura precisa ser antes do de fechamento.");
    }
    this.#diaSemana = diaSemana;
    this.#abre = aberturaEmMinutos;
    this.#fecha = fechamentoEmMinutos;
  }

  /** Lê um item de `horarios` da resposta da API. Devolve null se o item não servir. */
  static deResposta(bruto: unknown): HorarioDoDia | null {
    const leitor = LeitorDeObjeto.de(bruto);
    if (!leitor) return null;
    const dia = leitor.bruto("diaSemana");
    const abre = leitor.bruto("abre");
    const fecha = leitor.bruto("fecha");
    if (typeof dia !== "number" || typeof abre !== "string" || typeof fecha !== "string") return null;
    try {
      return new HorarioDoDia(dia, abre, fecha);
    } catch {
      return null;
    }
  }

  static #minutos(valor: string): number | null {
    const partes = HORA.exec(valor.trim());
    if (!partes) return null;
    const hora = Number(partes[1]);
    const minuto = Number(partes[2]);
    return hora > 23 || minuto > 59 ? null : hora * 60 + minuto;
  }

  static #escrever(minutos: number): string {
    return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
  }

  get diaSemana(): number {
    return this.#diaSemana;
  }

  get abre(): string {
    return HorarioDoDia.#escrever(this.#abre);
  }

  get fecha(): string {
    return HorarioDoDia.#escrever(this.#fecha);
  }

  /** "08:00 às 18:00" */
  get intervalo(): string {
    return `${this.abre} às ${this.fecha}`;
  }

  /** Abre e fecha na mesma hora que o outro dia (o dia da semana não conta). */
  mesmoIntervaloQue(outro: HorarioDoDia): boolean {
    return this.#abre === outro.#abre && this.#fecha === outro.#fecha;
  }

  paraDto(): HorarioDoPonto {
    return { diaSemana: this.#diaSemana, abre: this.abre, fecha: this.fecha };
  }

  toJSON(): HorarioDoPonto {
    return this.paraDto();
  }
}
