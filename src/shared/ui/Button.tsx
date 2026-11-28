import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./form.module.css";
import { ArrowRightIcon } from "./icons";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  loading?: boolean;
  showArrow?: boolean;
  /** Texto enquanto `loading` é verdadeiro. O padrão é "Enviando...". */
  loadingText?: string;
};

export function Button({
  children,
  loading,
  showArrow = true,
  loadingText = "Enviando...",
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button className={styles.button} disabled={disabled || loading} aria-busy={loading} {...rest}>
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {loading ? loadingText : children}
      {!loading && showArrow && <ArrowRightIcon />}
    </button>
  );
}
