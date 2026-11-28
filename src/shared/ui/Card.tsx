import type { ElementType, HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

type CardProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  /** Título do cartão (vira um cabeçalho). */
  title?: ReactNode;
  /** Ação do canto direito do cabeçalho (botão, selo...). */
  action?: ReactNode;
  /** Rodapé do cartão, separado do conteúdo por uma linha. */
  footer?: ReactNode;
  /** Troca a tag HTML (ex.: "section", "li"). O padrão é "div". */
  as?: ElementType;
  /** Cartão clicável ou com foco: ganha destaque ao passar o mouse. */
  interactive?: boolean;
};

export function Card({
  title,
  action,
  footer,
  as: Tag = "div",
  interactive,
  className,
  children,
  ...rest
}: CardProps) {
  const classes = [styles.card, interactive ? styles.interactive : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={classes} {...rest}>
      {(title || action) && (
        <div className={styles.header}>
          {title && <h3 className={styles.title}>{title}</h3>}
          {action && <div className={styles.action}>{action}</div>}
        </div>
      )}
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </Tag>
  );
}
