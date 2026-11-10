import { ATIVIDADES, ehAtividade, type Atividade } from "./perfil.ts";
import { horasCobradas } from "./preco.ts";

export type ErrosPorCampo = Record<string, string>;

export type BuscaValidada = {
  inicio: Date;
  fim: Date;
  horas: number;
  // null quando a query não trouxe: aí vale a atividade preferida do perfil
  atividade: Atividade | null;
};

const HORA_MS = 60 * 60 * 1000;
export const PERIODO_MINIMO_MS = HORA_MS;
export const PERIODO_MAXIMO_MS = 7 * 24 * HORA_MS;
// Folga para o relógio do celular e o tempo da requisição: um início "agora" não deve ser
// recusado por ter chegado alguns segundos depois.
export const TOLERANCIA_PASSADO_MS = 5 * 60 * 1000;

// Data e hora completas, com fuso obrigatório (Z ou ±hh:mm), como manda o contrato.
// Sem o fuso, "09:00" seria lido no fuso do servidor (UTC na Vercel), não no de São Luís.
const ISO_COM_FUSO =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function lerData(valor: unknown): Date | null {
  if (typeof valor !== "string" || !ISO_COM_FUSO.test(valor)) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

// Valida os parâmetros da busca de GET /api/recomendacao (inicio, fim e atividade).
export function validarBusca(
  parametros: { inicio?: unknown; fim?: unknown; atividade?: unknown },
  agora: Date,
): { dados: BuscaValidada } | { erros: ErrosPorCampo } {
  const erros: ErrosPorCampo = {};

  const inicio = lerData(parametros.inicio);
  if (!inicio) {
    erros.inicio = "Informe o início em ISO 8601 com fuso (ex.: 2026-11-14T09:00:00-03:00).";
  } else if (inicio.getTime() < agora.getTime() - TOLERANCIA_PASSADO_MS) {
    erros.inicio = "O início não pode estar no passado.";
  }

  const fim = lerData(parametros.fim);
  if (!fim) {
    erros.fim = "Informe o fim em ISO 8601 com fuso (ex.: 2026-11-14T13:00:00-03:00).";
  } else if (inicio) {
    const duracao = fim.getTime() - inicio.getTime();
    if (duracao <= 0) erros.fim = "O fim precisa ser depois do início.";
    else if (duracao < PERIODO_MINIMO_MS) erros.fim = "O período mínimo é de 1 hora.";
    else if (duracao > PERIODO_MAXIMO_MS) erros.fim = "O período máximo é de 7 dias.";
  }

  let atividade: Atividade | null = null;
  const bruta = parametros.atividade;
  if (bruta !== undefined && bruta !== null && bruta !== "") {
    if (ehAtividade(bruta)) atividade = bruta;
    else erros.atividade = `Atividade inválida. Use um destes valores: ${ATIVIDADES.join(", ")}.`;
  }

  if (Object.keys(erros).length > 0 || !inicio || !fim) return { erros };
  return { dados: { inicio, fim, horas: horasCobradas(inicio, fim), atividade } };
}
