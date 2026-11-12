import type { ReactNode } from "react";
import styles from "./Alert.module.css";

export type AlertVariant = "info" | "sucesso" | "aviso" | "erro";

type AlertProps = {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  /** Ação opcional abaixo da mensagem (ex.: botão "Tentar de novo"). */
  action?: ReactNode;
};

// Erros e avisos interrompem a leitura (role="alert"); informação e sucesso são anunciados
// com educação (role="status").
export function Alert({ variant = "info", title, children, action }: AlertProps) {
  const urgente = variant === "erro" || variant === "aviso";

  return (
    <div className={`${styles.alert} ${styles[variant]}`} role={urgente ? "alert" : "status"}>
      {title && <strong className={styles.title}>{title}</strong>}
      <div>{children}</div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
