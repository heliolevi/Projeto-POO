// Formatação de datas para a tela. Backend e banco trabalham em UTC; a tela mostra e digita em São
// Luís (America/Fortaleza, UTC-3, sem horário de verão) e envia à API ISO 8601 com offset -03:00
// (docs/contrato-api-mvp.md). O fuso e o offset entram pelo construtor.

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

export class FormatadorDeData {
  /** O formatador de São Luís, o único que o app usa. */
  static readonly saoLuis = new FormatadorDeData("America/Fortaleza", "-03:00");

  readonly #offsetDeEnvio: string;
  readonly #partes: Intl.DateTimeFormat;

  constructor(fuso: string, offsetDeEnvio: string) {
    this.#offsetDeEnvio = offsetDeEnvio;
    this.#partes = new Intl.DateTimeFormat("pt-BR", {
      timeZone: fuso,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  }

  static #paraData(valor: string | Date): Date {
    const data = valor instanceof Date ? valor : new Date(valor);
    if (Number.isNaN(data.getTime())) {
      throw new RangeError(`data inválida: ${String(valor)}`);
    }
    return data;
  }

  #partesLocais(valor: string | Date) {
    const partes: Record<string, string> = {};
    for (const p of this.#partes.formatToParts(FormatadorDeData.#paraData(valor))) {
      partes[p.type] = p.value;
    }
    return {
      data: `${partes.day}/${partes.month}/${partes.year}`,
      hora: `${partes.hour}:${partes.minute}`,
    };
  }

  /** Instante (ISO ou Date) -> "14/11/2026 09:00" no horário de São Luís. */
  dataHora(valor: string | Date): string {
    const { data, hora } = this.#partesLocais(valor);
    return `${data} ${hora}`;
  }

  /** Período -> "14/11/2026, 09:00 às 13:00" (mesmo dia local) ou com as duas datas. */
  periodo(inicio: string | Date, fim: string | Date): string {
    const i = this.#partesLocais(inicio);
    const f = this.#partesLocais(fim);
    if (i.data === f.data) return `${i.data}, ${i.hora} às ${f.hora}`;
    return `${i.data} ${i.hora} às ${f.data} ${f.hora}`;
  }

  /**
   * Data e hora locais digitadas ("2026-11-14", "09:00") -> "2026-11-14T09:00:00-03:00".
   * Não passa por `Date` local do navegador: o resultado não depende do fuso do aparelho.
   */
  paraIso(data: string, hora: string): string {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
    const h = /^(\d{2}):(\d{2})$/.exec(hora);
    if (!d || !h) {
      throw new RangeError(`esperado AAAA-MM-DD e HH:mm, recebido: "${data}" "${hora}"`);
    }
    const [ano, mes, dia] = [Number(d[1]), Number(d[2]), Number(d[3])];
    const [hh, mm] = [Number(h[1]), Number(h[2])];

    // Date.UTC "corrige" datas impossíveis rolando para outro mês (30/02 -> 02/03, mês 13 -> janeiro,
    // dia 0 -> último dia do mês anterior). Se o mês não ficou o mesmo, a data não existe.
    const mesResultante = new Date(Date.UTC(ano, mes - 1, dia)).getUTCMonth();
    if (mesResultante !== mes - 1 || hh > 23 || mm > 59) {
      throw new RangeError(`data ou hora inexistente: "${data}" "${hora}"`);
    }
    return `${data}T${hora}:00${this.#offsetDeEnvio}`;
  }

  /** Tempo entre dois instantes em texto: "3 h", "2 dias", "1 h 30 min", "1 dia 3 h". */
  duracao(inicio: string | Date, fim: string | Date): string {
    const ms = FormatadorDeData.#paraData(fim).getTime() - FormatadorDeData.#paraData(inicio).getTime();
    if (ms <= 0) throw new RangeError("o fim deve ser depois do início");

    const dias = Math.floor(ms / DIA);
    const horas = Math.floor((ms % DIA) / HORA);
    const minutos = Math.floor((ms % HORA) / MINUTO);

    const partes: string[] = [];
    if (dias > 0) partes.push(`${dias} ${dias === 1 ? "dia" : "dias"}`);
    if (horas > 0) partes.push(`${horas} h`);
    if (minutos > 0) partes.push(`${minutos} min`);
    return partes.length > 0 ? partes.join(" ") : "0 min";
  }
}
