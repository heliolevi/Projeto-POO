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

export const ROTULO_ITEM: Record<ItemChecklist, string> = {
  freios: "Freios",
  pneus: "Pneus",
  corrente: "Corrente",
  capacete: "Capacete",
  luzes: "Luzes",
};

export type Movimento = "retirada" | "devolucao";

export type CorpoMovimento = {
  checklist: { itens: { nome: ItemChecklist; ok: boolean }[]; observacoes?: string };
};

// Qual registro o balcão pode fazer agora: retirada só de CONFIRMADA, devolução só de EM_ANDAMENTO.
export function movimentoPossivel(status: StatusReserva): Movimento | null {
  if (status === "CONFIRMADA") return "retirada";
  if (status === "EM_ANDAMENTO") return "devolucao";
  return null;
}

// Monta o corpo das rotas 26 e 27. Item sem marcação conta como "não ok"; observação vazia some.
export function montarChecklist(
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
export function faltaObservacao(corpo: CorpoMovimento): boolean {
  return corpo.checklist.itens.some((i) => !i.ok) && !corpo.checklist.observacoes;
}

// "AAAA-MM-DD" do dia em São Luís (America/Fortaleza), como a query `data` da rota 25 espera.
export function dataEmSaoLuis(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

// Ordem da lista: o que o balcão precisa fazer primeiro (retiradas e devoluções), depois pelo horário.
export function ordenarParaOBalcao(reservas: ReservaDoPainel[]): ReservaDoPainel[] {
  const peso = (r: ReservaDoPainel) => (movimentoPossivel(r.status) ? 0 : 1);
  return [...reservas].sort(
    (a, b) => peso(a) - peso(b) || a.periodo.inicio.localeCompare(b.periodo.inicio),
  );
}
