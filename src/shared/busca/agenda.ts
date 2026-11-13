import { localParaIso } from "../format/moeda-e-data.ts";

// Agenda da busca: os dias que o cliente pode escolher, os horários de retirada de cada dia e o
// resumo do período (retirada e devolução). Tudo no fuso de São Luís, que é o do balcão.
const FUSO = "America/Fortaleza";

const SEMANA_CURTA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;
const SEMANA_LONGA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;
const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;
const MES_LONGO = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

// Horário do balcão por dia da semana (0 = domingo), o mesmo de src/shared/landing/locadora.ts:
// segunda a sexta das 8h às 18h, sábado das 8h às 16h e domingo das 8h às 14h. A última retirada
// é uma hora antes de fechar.
const BALCAO: Record<number, { abre: number; fecha: number }> = {
  0: { abre: 8, fecha: 14 },
  1: { abre: 8, fecha: 18 },
  2: { abre: 8, fecha: 18 },
  3: { abre: 8, fecha: 18 },
  4: { abre: 8, fecha: 18 },
  5: { abre: 8, fecha: 18 },
  6: { abre: 8, fecha: 16 },
};

export type OpcaoDeDia = {
  /** AAAA-MM-DD, o valor que vai para o formulário. */
  valor: string;
  semana: string;
  dia: string;
  mes: string;
  /** "Hoje" ou "Amanhã" nos dois primeiros dias; null nos demais. */
  destaque: "Hoje" | "Amanhã" | null;
  /** Leitura completa para leitor de tela, ex.: "sábado, 15 de novembro". */
  descricao: string;
};

type PartesDaData = { ano: number; mes: number; dia: number };

function partesEmSaoLuis(instante: Date): PartesDaData & { hora: number; minuto: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  return {
    ano: valor("year"),
    mes: valor("month"),
    dia: valor("day"),
    hora: valor("hour"),
    minuto: valor("minute"),
  };
}

// AAAA-MM-DD de uma data que existe; 30/02 ou mês 13 viram null (o Date.UTC "corrigiria" a data
// para outro dia sem avisar).
function lerData(data: string): PartesDaData | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) return null;
  const partes = { ano: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
  const d = new Date(Date.UTC(partes.ano, partes.mes - 1, partes.dia));
  const existe =
    d.getUTCFullYear() === partes.ano &&
    d.getUTCMonth() === partes.mes - 1 &&
    d.getUTCDate() === partes.dia;
  return existe ? partes : null;
}

function diaDaSemana({ ano, mes, dia }: PartesDaData): number {
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** Os próximos dias a partir de hoje (em São Luís), para a fileira de dias da busca. */
export function proximosDias(agora: Date = new Date(), quantidade = 14): OpcaoDeDia[] {
  const hoje = partesEmSaoLuis(agora);
  const dias: OpcaoDeDia[] = [];
  for (let i = 0; i < quantidade; i++) {
    const d = new Date(Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia + i));
    const ano = d.getUTCFullYear();
    const mes = d.getUTCMonth();
    const dia = d.getUTCDate();
    const semana = d.getUTCDay();
    dias.push({
      valor: `${ano}-${doisDigitos(mes + 1)}-${doisDigitos(dia)}`,
      semana: SEMANA_CURTA[semana],
      dia: String(dia),
      mes: MES_CURTO[mes],
      destaque: i === 0 ? "Hoje" : i === 1 ? "Amanhã" : null,
      descricao: `${SEMANA_LONGA[semana]}, ${dia} de ${MES_LONGO[mes]}`,
    });
  }
  return dias;
}

/**
 * Horários de retirada de um dia, de hora em hora, dentro do horário do balcão. Num dia que já
 * começou, só os horários que ainda não passaram.
 */
export function horariosDoDia(data: string, agora: Date = new Date()): string[] {
  const partes = lerData(data);
  if (!partes) return [];
  const { abre, fecha } = BALCAO[diaDaSemana(partes)];
  const horarios: string[] = [];
  for (let hora = abre; hora < fecha; hora++) {
    const valor = `${doisDigitos(hora)}:00`;
    if (new Date(localParaIso(data, valor)).getTime() > agora.getTime()) horarios.push(valor);
  }
  return horarios;
}

export type PontaDoPeriodo = { hora: string; dia: string };

/** Retirada e devolução para o bilhete da busca. null se a data ou a hora não forem válidas. */
export function retiradaEDevolucao(
  data: string,
  hora: string,
  duracaoMinutos: number,
): { retirada: PontaDoPeriodo; devolucao: PontaDoPeriodo } | null {
  let inicio: Date;
  try {
    inicio = new Date(localParaIso(data, hora));
  } catch {
    return null;
  }
  if (!Number.isFinite(duracaoMinutos) || duracaoMinutos <= 0) return null;
  const fim = new Date(inicio.getTime() + duracaoMinutos * 60_000);

  const ponta = (instante: Date): PontaDoPeriodo => {
    const p = partesEmSaoLuis(instante);
    return {
      hora: `${doisDigitos(p.hora)}:${doisDigitos(p.minuto)}`,
      dia: `${SEMANA_CURTA[diaDaSemana(p)]}, ${p.dia} ${MES_CURTO[p.mes - 1]}`,
    };
  };
  return { retirada: ponta(inicio), devolucao: ponta(fim) };
}
