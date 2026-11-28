import { PrazoDePagamento } from "../../../shared/dominio/prazos.ts";

// Mesmos valores do enum status_reserva do banco (migration 0006). O contrato lista seis; o
// NAO_RETIRADA existe no banco e entra na operação (fase 5).
const STATUS = [
  "PENDENTE_PAGAMENTO",
  "CONFIRMADA",
  "EM_ANDAMENTO",
  "CONCLUIDA",
  "CANCELADA",
  "EXPIRADA",
  "NAO_RETIRADA",
] as const;
export type StatusReserva = (typeof STATUS)[number];

// As regras de status da reserva: quais existem, para onde cada um pode ir e quando o prazo de
// pagamento vence. Só tem membros estáticos (não guarda estado): a classe Reserva, o repositório e
// os filtros leem a mesma tabela, então a regra mora num lugar só.
export class RegrasDeReserva {
  /** Todos os status, na ordem do enum do banco. */
  static readonly STATUS: readonly StatusReserva[] = STATUS;

  // A reserva pendente segura a bicicleta por 15 minutos. É o mesmo prazo de
  // expirar_reservas_vencidas() no banco (migration 0008), que conta a partir de criado_em: o banco
  // não tem coluna expira_em, o prazo é sempre a criação + 15 minutos.
  static readonly PRAZO_PAGAMENTO_MS = PrazoDePagamento.MS;

  // Máquina de estados da reserva: para cada status, os que podem vir depois. É a fonte única da
  // regra: a classe Reserva e o podeCancelar() leem esta mesma tabela. Expirada, cancelada, concluída
  // e não retirada são finais; só pendente e confirmada podem ser canceladas (antes da retirada).
  static readonly TRANSICOES: Readonly<Record<StatusReserva, readonly StatusReserva[]>> = {
    PENDENTE_PAGAMENTO: ["CONFIRMADA", "CANCELADA", "EXPIRADA"],
    CONFIRMADA: ["EM_ANDAMENTO", "CANCELADA", "NAO_RETIRADA"],
    EM_ANDAMENTO: ["CONCLUIDA"],
    CONCLUIDA: [],
    CANCELADA: [],
    EXPIRADA: [],
    NAO_RETIRADA: [],
  };

  private constructor() {
    throw new Error("RegrasDeReserva só tem membros estáticos.");
  }

  static ehStatus(valor: unknown): valor is StatusReserva {
    return typeof valor === "string" && (STATUS as readonly string[]).includes(valor);
  }

  // Só a reserva pendente tem prazo; nos outros estados o contrato manda null.
  static calcularExpiraEm(status: StatusReserva, criadaEm: Date): Date | null {
    return status === "PENDENTE_PAGAMENTO" ? PrazoDePagamento.venceEm(criadaEm) : null;
  }

  static podeTransitar(de: StatusReserva, para: StatusReserva): boolean {
    return RegrasDeReserva.TRANSICOES[de].includes(para);
  }

  // Cancelar vale antes da retirada: pendente ou confirmada (a retirada passa a reserva para
  // EM_ANDAMENTO). Qualquer outro estado já terminou ou já começou.
  static podeCancelar(status: StatusReserva): boolean {
    return RegrasDeReserva.podeTransitar(status, "CANCELADA");
  }
}
