import type { StatusReserva } from "../reservas/reserva.ts";

// Painel de operação (B19): rotas 25 a 27 de docs/contrato-api-mvp.md.

export type ReservaDoPainel = {
  id: string;
  codigo: string;
  status: StatusReserva;
  cliente: { id: string; nome: string };
  tipo: { id: string; nome: string };
  bicicleta: { id: string; codigo: string } | null;
  periodo: { inicio: string; fim: string };
  valorAluguelCentavos: number;
};

export const ITENS_CHECKLIST = ["freios", "pneus", "corrente", "capacete", "luzes"] as const;
export type ItemChecklist = (typeof ITENS_CHECKLIST)[number];

const ROTULO_ITEM: Readonly<Record<ItemChecklist, string>> = {
  freios: "Freios",
  pneus: "Pneus",
  corrente: "Corrente",
  capacete: "Capacete",
  luzes: "Luzes",
};

// O texto de cada item do checklist. Só tem método estático, então não se cria instância.
export class RotulosDoChecklist {
  private constructor() {
    throw new Error("RotulosDoChecklist só tem métodos estáticos.");
  }

  static item(valor: ItemChecklist): string {
    return ROTULO_ITEM[valor];
  }
}

export type Movimento = "retirada" | "devolucao";

export type CorpoMovimento = {
  checklist: { itens: { nome: ItemChecklist; ok: boolean }[]; observacoes?: string };
};

// Qual registro o balcão pode fazer agora. Só tem método estático, então não se cria instância.
export class MovimentoDoBalcao {
  private constructor() {
    throw new Error("MovimentoDoBalcao só tem métodos estáticos.");
  }

  // Retirada só de CONFIRMADA, devolução só de EM_ANDAMENTO.
  static possivel(status: StatusReserva): Movimento | null {
    if (status === "CONFIRMADA") return "retirada";
    if (status === "EM_ANDAMENTO") return "devolucao";
    return null;
  }
}

// O checklist que o balcão envia nas rotas 26 e 27. Só tem métodos estáticos, então não se cria
// instância.
export class ChecklistDoBalcao {
  private constructor() {
    throw new Error("ChecklistDoBalcao só tem métodos estáticos.");
  }

  // Monta o corpo das rotas 26 e 27. Item sem marcação conta como "não ok"; observação vazia some.
  static montar(
    marcados: Partial<Record<ItemChecklist, boolean>>,
    observacoes: string,
  ): CorpoMovimento {
    const limpa = observacoes.trim();
    return {
      checklist: {
        itens: ITENS_CHECKLIST.map((nome) => ({ nome, ok: marcados[nome] === true })),
        ...(limpa ? { observacoes: limpa } : {}),
      },
    };
  }

  // Algum item com problema exige uma observação: o próximo turno precisa saber o que houve.
  static faltaObservacao(corpo: CorpoMovimento): boolean {
    return corpo.checklist.itens.some((i) => !i.ok) && !corpo.checklist.observacoes;
  }
}

// A lista do dia do balcão. Só tem métodos estáticos (o instante vem de quem chama), então não se
// cria instância.
export class FilaDoBalcao {
  private constructor() {
    throw new Error("FilaDoBalcao só tem métodos estáticos.");
  }

  // "AAAA-MM-DD" do dia em São Luís (America/Fortaleza), como a query `data` da rota 25 espera.
  static dataEmSaoLuis(agora: Date = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Fortaleza",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(agora);
  }

  // Ordem da lista: o que o balcão precisa fazer primeiro (retiradas e devoluções), depois pelo horário.
  static ordenar(reservas: readonly ReservaDoPainel[]): ReservaDoPainel[] {
    const peso = (r: ReservaDoPainel) => (MovimentoDoBalcao.possivel(r.status) ? 0 : 1);
    return [...reservas].sort(
      (a, b) => peso(a) - peso(b) || Date.parse(a.periodo.inicio) - Date.parse(b.periodo.inicio),
    );
  }

  // Reservas EM_ANDAMENTO que não estão na lista do dia (ex.: retirada ontem, devolução hoje).
  // Sem isso a devolução de um aluguel que começou em outro dia não aparece no painel.
  static andamentoDeOutrosDias(
    doDia: readonly ReservaDoPainel[],
    emAndamento: readonly ReservaDoPainel[],
  ): ReservaDoPainel[] {
    const ids = new Set(doDia.map((r) => r.id));
    return FilaDoBalcao.ordenar(emAndamento.filter((r) => r.status === "EM_ANDAMENTO" && !ids.has(r.id)));
  }
}
