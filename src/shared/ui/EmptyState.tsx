import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

type EmptyStateProps = {
  title: string;
  children?: ReactNode;
  /** Ação sugerida (ex.: um botão ou link). */
  action?: ReactNode;
};

export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div className={styles.vazio}>
      <p className={styles.titulo}>{title}</p>
      {children && <p className={styles.texto}>{children}</p>}
      {action && <div className={styles.acao}>{action}</div>}
    </div>
  );
}
