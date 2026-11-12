import type { HTMLAttributes } from "react";
import styles from "./Badge.module.css";

export type BadgeVariant = "neutro" | "sucesso" | "aviso" | "perigo" | "info";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({ variant = "neutro", className, children, ...rest }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[variant]} ${className ?? ""}`.trim()} {...rest}>
      {children}
    </span>
  );
}
