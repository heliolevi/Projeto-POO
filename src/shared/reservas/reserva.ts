export type StatusReserva =
  | "PENDENTE_PAGAMENTO"
  | "CONFIRMADA"
  | "EM_ANDAMENTO"
  | "CONCLUIDA"
  | "CANCELADA"
  | "EXPIRADA";

// Objeto `reserva` do contrato da API (docs/contrato-api-mvp.md).
export type Reserva = {
  id: string;
  codigo: string;
  status: StatusReserva;
  tipo: { id: string; nome: string };
  ponto: { id: string; nome: string; endereco: string };
  periodo: { inicio: string; fim: string };
  valorAluguelCentavos: number;
  valorCaucaoCentavos: number;
  expiraEm: string | null;
  criadaEm: string;
};

export type ReservaDetalhada = Reserva & {
  pagamento: { status: "PENDENTE" | "APROVADO" | "RECUSADO" | "EXPIRADO"; metodo: "PIX" } | null;
};

export const ROTULO_STATUS: Record<StatusReserva, string> = {
  PENDENTE_PAGAMENTO: "Aguardando pagamento",
  CONFIRMADA: "Confirmada",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
  EXPIRADA: "Expirada",
};

export function podeCancelar(status: StatusReserva): boolean {
  return status === "PENDENTE_PAGAMENTO" || status === "CONFIRMADA";
}

// Segundos que faltam até `expiraEm` (nunca negativo). Sem prazo, devolve 0.
export function segundosRestantes(expiraEm: string | null, agora: Date = new Date()): number {
  if (!expiraEm) return 0;
  const restante = Math.ceil((new Date(expiraEm).getTime() - agora.getTime()) / 1000);
  return Number.isFinite(restante) && restante > 0 ? restante : 0;
}

export function formatarContagem(segundos: number): string {
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${String(minutos).padStart(2, "0")}:${String(resto).padStart(2, "0")}`;
}
