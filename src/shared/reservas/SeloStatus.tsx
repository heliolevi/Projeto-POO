import { ROTULO_STATUS, type StatusReserva } from "./reserva";
import styles from "./reservas.module.css";

function classeDoStatus(status: StatusReserva): string {
  if (status === "CONFIRMADA" || status === "EM_ANDAMENTO") return styles.seloConfirmada;
  if (status === "PENDENTE_PAGAMENTO") return styles.seloPendente;
  if (status === "CONCLUIDA" || status === "CANCELADA" || status === "EXPIRADA") {
    return styles.seloEncerrada;
  }
  return "";
}

export function SeloStatus({ status }: { status: StatusReserva }) {
  return <span className={`${styles.selo} ${classeDoStatus(status)}`}>{ROTULO_STATUS[status]}</span>;
}
