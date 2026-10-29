"use client";

import { useState, type InputHTMLAttributes } from "react";
import styles from "./form.module.css";
import { TextField } from "./TextField";
import { EyeIcon, LockIcon } from "./icons";

type PasswordFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
  visible?: boolean;
  onToggleVisible?: (visible: boolean) => void;
};

export function PasswordField({
  label,
  error,
  hint,
  visible: visibleProp,
  onToggleVisible,
  ...inputProps
}: PasswordFieldProps) {
  const [visibleState, setVisibleState] = useState(false);
  const visible = visibleProp ?? visibleState;

  function alternar() {
    if (onToggleVisible) onToggleVisible(!visible);
    else setVisibleState((v) => !v);
  }

  return (
    <TextField
      label={label}
      icon={<LockIcon />}
      error={error}
      hint={hint}
      type={visible ? "text" : "password"}
      endAdornment={
        <button
          type="button"
          className={styles.toggleVisibility}
          onClick={alternar}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        >
          <EyeIcon open={visible} />
        </button>
      }
      {...inputProps}
    />
  );
}
