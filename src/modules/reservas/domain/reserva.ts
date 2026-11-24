import { PRAZO_DE_PAGAMENTO_MS } from "../../../shared/dominio/prazos.ts";
import { randomBytes } from "node:crypto";
import { validarBusca, type ErrosPorCampo } from "../../../shared/dominio/periodo.ts";

// Mesmos valores do enum status_reserva do banco (migration 0006). O contrato lista seis; o
// NAO_RETIRADA existe no banco e entra na operação (fase 5).
export const STATUS_RESERVA = [
  "PENDENTE_PAGAMENTO",
  "CONFIRMADA",
  "EM_ANDAMENTO",
  "CONCLUIDA",
  "CANCELADA",
  "EXPIRADA",
  "NAO_RETIRADA",
] as const;
export type StatusReserva = (typeof STATUS_RESERVA)[number];

export function ehStatusReserva(valor: unknown): valor is StatusReserva {
  return typeof valor === "string" && (STATUS_RESERVA as readonly string[]).includes(valor);
}

// A reserva pendente segura a bicicleta por 15 minutos. É o mesmo prazo de
// expirar_reservas_vencidas() no banco (migration 0008), que conta a partir de criado_em: o banco
// não tem coluna expira_em, o prazo é sempre a criação + 15 minutos.
export const PRAZO_PAGAMENTO_MS = PRAZO_DE_PAGAMENTO_MS;

// Só a reserva pendente tem prazo; nos outros estados o contrato manda null.
export function calcularExpiraEm(status: StatusReserva, criadaEm: Date): Date | null {
  return status === "PENDENTE_PAGAMENTO" ? new Date(criadaEm.getTime() + PRAZO_PAGAMENTO_MS) : null;
}

// Máquina de estados da reserva: para cada status, os que podem vir depois. É a fonte única da regra:
// a classe Reserva e o podeCancelar() leem esta mesma tabela. Expirada, cancelada, concluída e
// não retirada são finais; só pendente e confirmada podem ser canceladas (antes da retirada).
export const TRANSICOES: Record<StatusReserva, readonly StatusReserva[]> = {
  PENDENTE_PAGAMENTO: ["CONFIRMADA", "CANCELADA", "EXPIRADA"],
  CONFIRMADA: ["EM_ANDAMENTO", "CANCELADA", "NAO_RETIRADA"],
  EM_ANDAMENTO: ["CONCLUIDA"],
  CONCLUIDA: [],
  CANCELADA: [],
  EXPIRADA: [],
  NAO_RETIRADA: [],
};

export function podeTransitar(de: StatusReserva, para: StatusReserva): boolean {
  return TRANSICOES[de].includes(para);
}

// Cancelar vale antes da retirada: pendente ou confirmada (a retirada passa a reserva para
// EM_ANDAMENTO). Qualquer outro estado já terminou ou já começou.
export function podeCancelar(status: StatusReserva): boolean {
  return podeTransitar(status, "CANCELADA");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Identificador de reserva vindo da URL. Um texto que não é UUID não pode chegar ao banco (daria
// erro 22P02 e um 500): para a API ele é só mais uma reserva que não existe, e responde 404.
export function ehUuid(valor: unknown): valor is string {
  return typeof valor === "string" && UUID.test(valor);
}

export type NovaReserva = { tipoId: string; inicio: Date; fim: Date };

// Valida o corpo de POST /api/reservas. Só lê tipoId, inicio e fim: o valor e a unidade são do
// servidor, e qualquer campo a mais (valor, bicicletaId, clienteId) é ignorado. O período segue
// as mesmas regras da recomendação (docs/contrato-api-mvp.md, rota 12).
export function validarNovaReserva(
  corpo: unknown,
  agora: Date,
): { dados: NovaReserva } | { erros: ErrosPorCampo } {
  const objeto =
    typeof corpo === "object" && corpo !== null && !Array.isArray(corpo)
      ? (corpo as Record<string, unknown>)
      : {};

  const erros: ErrosPorCampo = {};
  const tipoId = objeto.tipoId;
  if (typeof tipoId !== "string" || !UUID.test(tipoId)) {
    erros.tipoId = "Informe o tipoId da bicicleta (um UUID).";
  }

  const periodo = validarBusca({ inicio: objeto.inicio, fim: objeto.fim }, agora);
  if ("erros" in periodo) Object.assign(erros, periodo.erros);

  if (Object.keys(erros).length > 0 || "erros" in periodo) return { erros };
  return { dados: { tipoId: tipoId as string, inicio: periodo.dados.inicio, fim: periodo.dados.fim } };
}

// Sem 0, O, 1, I e L, que se confundem quando o cliente lê o código em voz alta no balcão.
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const TAMANHO_CODIGO = 6;
// Maior múltiplo de 31 abaixo de 256: bytes a partir daqui são descartados, senão os primeiros
// caracteres do alfabeto sairiam mais que os últimos.
const LIMITE_BYTE = 256 - (256 % ALFABETO.length);

// Código curto e único da reserva (coluna reserva.codigo, UNIQUE): "BIC-7K2F9Q". A unicidade é do
// banco: quem grava repete com outro código se der 23505. `aleatorio` existe para os testes.
export function gerarCodigoReserva(
  aleatorio: (n: number) => Uint8Array = (n) => randomBytes(n),
): string {
  let codigo = "";
  while (codigo.length < TAMANHO_CODIGO) {
    for (const byte of aleatorio(TAMANHO_CODIGO * 2)) {
      if (byte >= LIMITE_BYTE) continue;
      codigo += ALFABETO[byte % ALFABETO.length];
      if (codigo.length === TAMANHO_CODIGO) break;
    }
  }
  return `BIC-${codigo}`;
}
