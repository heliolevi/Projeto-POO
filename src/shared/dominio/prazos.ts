// Prazo para pagar: uma reserva pendente e o Pix dela valem 15 minutos. É o mesmo prazo de
// expirar_reservas_vencidas() no banco (migration 0008). Uma regra só, para a reserva e o
// pagamento não divergirem.
export class PrazoDePagamento {
  static readonly MS = 15 * 60 * 1000;

  private constructor() {
    throw new Error("PrazoDePagamento só tem membros estáticos.");
  }

  /** Quando uma reserva criada em `criadaEm` deixa de valer se não for paga. */
  static venceEm(criadaEm: Date): Date {
    return new Date(criadaEm.getTime() + PrazoDePagamento.MS);
  }
}
