import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import styles from "./form.module.css";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon: ReactNode;
  error?: string;
  hint?: string;
  endAdornment?: ReactNode;
};

export function TextField({ label, icon, error, hint, endAdornment, id, ...inputProps }: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={fieldId}>
        {label}
      </label>
      <div className={styles.inputWrapper}>
        <span className={styles.icon}>{icon}</span>
        <input
          id={fieldId}
          className={`${styles.input} ${error ? styles.inputError : ""}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          {...inputProps}
        />
        {endAdornment}
      </div>
      {error ? (
        <span id={`${fieldId}-error`} className={styles.errorText}>
          {error}
        </span>
      ) : (
        hint && <span className={styles.hintText}>{hint}</span>
      )}
    </div>
  );
}
