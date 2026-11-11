import type { StatusReserva } from "../reservas/reserva.ts";

export type StatusPagamento = "PENDENTE" | "APROVADO" | "RECUSADO" | "EXPIRADO";

// POST /api/pagamentos (contrato, rota 16)
export type CobrancaPix = {
  pagamentoId: string;
  reservaId: string;
  metodo: "PIX";
  status: StatusPagamento;
  valorCentavos: number;
  pix: { qrCodeBase64: string; copiaECola: string; expiraEm: string };
};

// GET /api/pagamentos/{reservaId}/status (contrato, rota 17)
export type StatusDoPagamento = {
  reservaId: string;
  statusPagamento: StatusPagamento | null;
  statusReserva: StatusReserva;
};

export type SituacaoDoPix = "aguardando" | "confirmado" | "encerrado";

// Decide o que a tela do Pix faz a cada consulta de status (a cada 3 s).
export function situacaoDoPix(status: StatusDoPagamento): SituacaoDoPix {
  if (status.statusReserva === "CONFIRMADA" || status.statusPagamento === "APROVADO") {
    return "confirmado";
  }
  if (
    status.statusReserva === "EXPIRADA" ||
    status.statusReserva === "CANCELADA" ||
    status.statusPagamento === "RECUSADO" ||
    status.statusPagamento === "EXPIRADO"
  ) {
    return "encerrado";
  }
  return "aguardando";
}

export function imagemDoQrCode(qrCodeBase64: string): string {
  return `data:image/png;base64,${qrCodeBase64}`;
}
