// Prazo para pagar: uma reserva pendente e o Pix dela valem 15 minutos. É o mesmo prazo de
// expirar_reservas_vencidas() no banco (migration 0008). Uma constante só, para a reserva e o
// pagamento não divergirem.
export const PRAZO_DE_PAGAMENTO_MS = 15 * 60 * 1000;
