import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

type EmptyStateProps = {
  title: string;
  /** Tag do título. O padrão é "p"; use "h1" ou "h2" quando o título é o da página. */
  as?: "p" | "h1" | "h2";
  children?: ReactNode;
  /** Ação sugerida (ex.: um botão ou link). */
  action?: ReactNode;
};

export function EmptyState({ title, as: Titulo = "p", children, action }: EmptyStateProps) {
  return (
    <div className={styles.vazio}>
      <Titulo className={styles.titulo}>{title}</Titulo>
      {children && <p className={styles.texto}>{children}</p>}
      {action && <div className={styles.acao}>{action}</div>}
    </div>
  );
}
