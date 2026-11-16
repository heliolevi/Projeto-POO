import type { Reserva } from "../reservas/reserva.ts";

const FUSO = "America/Fortaleza";
const COM_ACAO = ["CONFIRMADA", "PENDENTE_PAGAMENTO"] as const;

// A reserva que o cliente mais precisa ver ao abrir o app: a que está em andamento (ele está
// pedalando agora); senão, a mais próxima que ainda não terminou, paga ou esperando o pagamento.
export function proximaReserva(reservas: Reserva[], agora: Date = new Date()): Reserva | null {
  const emAndamento = reservas.find((r) => r.status === "EM_ANDAMENTO");
  if (emAndamento) return emAndamento;

  const futuras = reservas
    .filter(
      (r) =>
        (COM_ACAO as readonly string[]).includes(r.status) &&
        Date.parse(r.periodo.fim) > agora.getTime(),
    )
    .sort((a, b) => Date.parse(a.periodo.inicio) - Date.parse(b.periodo.inicio));
  return futuras[0] ?? null;
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

// Bom dia, boa tarde ou boa noite pela hora de São Luís (e não pela do servidor ou do aparelho).
export function saudacao(agora: Date = new Date()): string {
  const hora = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", hourCycle: "h23" }).format(
      agora,
    ),
  );
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}
