import { FormatadorDeData } from "../../../shared/format/formatador-de-data.ts";
import { STATUS_RESERVA, ehStatusReserva, type StatusReserva } from "./reserva.ts";

export type ErrosPorCampo = Record<string, string>;

/** O que chega na query de GET /api/admin/reservas, ainda sem confiar em nada. */
export type ParametrosDoPainel = { status?: unknown; data?: unknown };

const UM_DIA_MS = 24 * 60 * 60 * 1000;
// Datas fora desta faixa não fazem sentido para uma locadora e o banco recusaria algumas delas.
const ANO_MINIMO = 2000;
const ANO_MAXIMO = 2100;

// O filtro da lista do painel (rota 25 do contrato): por status e/ou por dia. O dia é o de São
// Luís (UTC-3, sem horário de verão), então "2026-11-14" quer dizer as reservas que COMEÇAM entre
// 14/11 às 00:00 e 15/11 às 00:00 no horário local, o que em UTC é de 03:00Z a 03:00Z. O objeto só
// existe válido: quem o recebe não precisa conferir de novo.
export class FiltroDoPainel {
  readonly #status: StatusReserva | null;
  readonly #inicioDoDia: number | null;

  private constructor(status: StatusReserva | null, inicioDoDia: number | null) {
    this.#status = status;
    this.#inicioDoDia = inicioDoDia;
  }

  /**
   * Valida os parâmetros. Texto vazio ou ausente quer dizer "sem esse filtro". Devolve o filtro ou
   * uma mensagem por campo (o formato do `details` do erro 400).
   */
  static validar(parametros: ParametrosDoPainel): { filtro: FiltroDoPainel } | { erros: ErrosPorCampo } {
    const erros: ErrosPorCampo = {};

    let status: StatusReserva | null = null;
    const statusBruto = parametros.status;
    if (statusBruto !== undefined && statusBruto !== null && statusBruto !== "") {
      if (ehStatusReserva(statusBruto)) status = statusBruto;
      else erros.status = `Status inválido. Use um destes valores: ${STATUS_RESERVA.join(", ")}.`;
    }

    let inicioDoDia: number | null = null;
    const dataBruta = parametros.data;
    if (dataBruta !== undefined && dataBruta !== null && dataBruta !== "") {
      inicioDoDia = FiltroDoPainel.#lerDia(dataBruta);
      if (inicioDoDia === null) erros.data = `Informe a data como AAAA-MM-DD, uma data que exista, entre ${ANO_MINIMO} e ${ANO_MAXIMO}.`;
    }

    if (Object.keys(erros).length > 0) return { erros };
    return { filtro: new FiltroDoPainel(status, inicioDoDia) };
  }

  // O instante (em ms) em que o dia começa em São Luís, ou null se a data não servir.
  static #lerDia(bruta: unknown): number | null {
    if (typeof bruta !== "string") return null;
    const ano = Number(bruta.slice(0, 4));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bruta) || ano < ANO_MINIMO || ano > ANO_MAXIMO) return null;
    try {
      return new Date(FormatadorDeData.saoLuis.paraIso(bruta, "00:00")).getTime();
    } catch {
      return null; // data que não existe (30/02, mês 13...)
    }
  }

  get status(): StatusReserva | null {
    return this.#status;
  }

  /** Começo do dia local (inclusive), ou null se o filtro não é por dia. */
  get inicioDoDia(): Date | null {
    return this.#inicioDoDia === null ? null : new Date(this.#inicioDoDia);
  }

  /** Começo do dia seguinte (exclusivo), ou null se o filtro não é por dia. */
  get fimDoDia(): Date | null {
    return this.#inicioDoDia === null ? null : new Date(this.#inicioDoDia + UM_DIA_MS);
  }

  /** Sem nenhum filtro: a lista traz tudo. */
  get vazio(): boolean {
    return this.#status === null && this.#inicioDoDia === null;
  }
}
