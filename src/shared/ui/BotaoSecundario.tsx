import type { ButtonHTMLAttributes } from "react";
import styles from "./BotaoSecundario.module.css";

// Botão de ação discreta, como o "Tentar de novo" de um aviso de erro. O foco visível vem do estilo
// global (globals.css). O tipo padrão é "button", para nunca enviar um formulário sem querer.
export function BotaoSecundario({ className, type = "button", ...resto }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={className ? `${styles.botao} ${className}` : styles.botao} {...resto} />;
}
