import { StatusDaReserva, type StatusReserva } from "./reserva";
import styles from "./reservas.module.css";

const CLASSE_DA_VARIANTE = {
  confirmada: styles.seloConfirmada,
  pendente: styles.seloPendente,
  encerrada: styles.seloEncerrada,
} as const;

export function SeloStatus({ status }: { status: StatusReserva }) {
  return <span className={`${styles.selo} ${CLASSE_DA_VARIANTE[StatusDaReserva.variante(status)]}`}>{StatusDaReserva.rotulo(status)}</span>;
}
