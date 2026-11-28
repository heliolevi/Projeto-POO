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

const ROTULO_STATUS: Readonly<Record<StatusReserva, string>> = {
  PENDENTE_PAGAMENTO: "Aguardando pagamento",
  CONFIRMADA: "Confirmada",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
  EXPIRADA: "Expirada",
};

// O texto que o cliente lê para o status da reserva e a regra de cancelamento da tela. Só tem
// métodos estáticos (não guarda estado), então não se cria instância.
export class StatusDaReserva {
  private constructor() {
    throw new Error("StatusDaReserva só tem métodos estáticos.");
  }

  static rotulo(status: StatusReserva): string {
    return ROTULO_STATUS[status];
  }

  // O grupo de cor do selo: confirmada (ativa), pendente (esperando pagamento) ou encerrada.
  static variante(status: StatusReserva): "confirmada" | "pendente" | "encerrada" {
    if (status === "CONFIRMADA" || status === "EM_ANDAMENTO") return "confirmada";
    if (status === "PENDENTE_PAGAMENTO") return "pendente";
    return "encerrada";
  }

  static podeCancelar(status: StatusReserva): boolean {
    return status === "PENDENTE_PAGAMENTO" || status === "CONFIRMADA";
  }
}

// A contagem regressiva do prazo de pagamento. Só tem métodos estáticos (o instante vem de quem
// chama), então não se cria instância.
export class ContagemDoPrazo {
  private constructor() {
    throw new Error("ContagemDoPrazo só tem métodos estáticos.");
  }

  // Segundos que faltam até `expiraEm` (nunca negativo). Sem prazo, devolve 0.
  static segundosRestantes(expiraEm: string | null, agora: Date = new Date()): number {
    if (!expiraEm) return 0;
    const restante = Math.ceil((new Date(expiraEm).getTime() - agora.getTime()) / 1000);
    return Number.isFinite(restante) && restante > 0 ? restante : 0;
  }

  static formatar(segundos: number): string {
    const minutos = Math.floor(segundos / 60);
    const resto = segundos % 60;
    return `${String(minutos).padStart(2, "0")}:${String(resto).padStart(2, "0")}`;
  }
}
