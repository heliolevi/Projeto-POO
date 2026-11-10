// Formatação de dinheiro e datas para a tela.
// Backend e banco trabalham em UTC; a tela mostra e digita em São Luís (America/Fortaleza,
// UTC-3, sem horário de verão) e envia à API ISO 8601 com offset -03:00 (docs/contrato-api-mvp.md).

const FUSO = "America/Fortaleza";
const OFFSET_ENVIO = "-03:00";

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** Centavos inteiros -> "R$ 1.234,56". Dinheiro nunca é decimal (contrato). */
export function formatarReais(centavos: number): string {
  if (!Number.isInteger(centavos)) {
    throw new RangeError(`centavos deve ser inteiro, recebido: ${centavos}`);
  }
  const absoluto = Math.abs(centavos);
  const reais = Math.floor(absoluto / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const resto = (absoluto % 100).toString().padStart(2, "0");
  return `${centavos < 0 ? "-" : ""}R$ ${reais},${resto}`;
}

function paraData(valor: string | Date): Date {
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) {
    throw new RangeError(`data inválida: ${String(valor)}`);
  }
  return data;
}

const partesFormatador = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function partesLocais(valor: string | Date) {
  const partes: Record<string, string> = {};
  for (const p of partesFormatador.formatToParts(paraData(valor))) {
    partes[p.type] = p.value;
  }
  return {
    data: `${partes.day}/${partes.month}/${partes.year}`,
    hora: `${partes.hour}:${partes.minute}`,
  };
}

/** Instante (ISO ou Date) -> "14/11/2026 09:00" no horário de São Luís. */
export function formatarDataHora(valor: string | Date): string {
  const { data, hora } = partesLocais(valor);
  return `${data} ${hora}`;
}

/** Período -> "14/11/2026, 09:00 às 13:00" (mesmo dia local) ou com as duas datas. */
export function formatarPeriodo(inicio: string | Date, fim: string | Date): string {
  const i = partesLocais(inicio);
  const f = partesLocais(fim);
  if (i.data === f.data) return `${i.data}, ${i.hora} às ${f.hora}`;
  return `${i.data} ${i.hora} às ${f.data} ${f.hora}`;
}

/**
 * Data e hora locais digitadas ("2026-11-14", "09:00") -> "2026-11-14T09:00:00-03:00".
 * Não passa por `Date` local do navegador: o resultado não depende do fuso do aparelho.
 */
export function localParaIso(data: string, hora: string): string {
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
  return `${data}T${hora}:00${OFFSET_ENVIO}`;
}

/** Tempo entre dois instantes em texto: "3 h", "2 dias", "1 h 30 min", "1 dia 3 h". */
export function formatarDuracao(inicio: string | Date, fim: string | Date): string {
  const ms = paraData(fim).getTime() - paraData(inicio).getTime();
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
