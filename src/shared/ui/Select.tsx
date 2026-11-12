import { useId, type SelectHTMLAttributes } from "react";
import styles from "./form.module.css";
import selectStyles from "./Select.module.css";

export type OpcaoSelect = { valor: string; rotulo: string };

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  label: string;
  opcoes: OpcaoSelect[];
  /** Texto da primeira opção, sem valor (ex.: "Escolha uma opção"). */
  placeholder?: string;
  error?: string;
  hint?: string;
};

export function Select({ label, opcoes, placeholder, error, hint, id, ...selectProps }: SelectProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={fieldId}>
        {label}
      </label>
      <select
        id={fieldId}
        className={`${selectStyles.select} ${error ? selectStyles.selectError : ""}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        {...selectProps}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </option>
        ))}
      </select>
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
