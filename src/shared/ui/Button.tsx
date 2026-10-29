import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./form.module.css";
import { ArrowRightIcon } from "./icons";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  loading?: boolean;
  showArrow?: boolean;
};

export function Button({ children, loading, showArrow = true, disabled, ...rest }: ButtonProps) {
  return (
    <button className={styles.button} disabled={disabled || loading} {...rest}>
      {loading ? "Enviando..." : children}
      {!loading && showArrow && <ArrowRightIcon />}
    </button>
  );
}
