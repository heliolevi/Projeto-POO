import type { ReactNode } from "react";
import styles from "./Table.module.css";

export type ColunaTabela<T> = {
  chave: string;
  cabecalho: string;
  /** Como mostrar a célula. Sem isso, usa `linha[chave]`. */
  celula?: (linha: T) => ReactNode;
  alinhamento?: "esquerda" | "direita";
};

type TableProps<T> = {
  /** Descrição da tabela para leitores de tela (fica escondida visualmente). */
  legenda: string;
  colunas: ColunaTabela<T>[];
  linhas: T[];
  chaveDaLinha: (linha: T) => string;
  /** Texto quando não há linhas. */
  vazio?: string;
};

export function Table<T>({
  legenda,
  colunas,
  linhas,
  chaveDaLinha,
  vazio = "Nada por aqui ainda.",
}: TableProps<T>) {
  if (linhas.length === 0) return <p className={styles.vazio}>{vazio}</p>;

  return (
    <div className={styles.rolagem}>
      <table className={styles.tabela}>
        <caption className={styles.legenda}>{legenda}</caption>
        <thead>
          <tr>
            {colunas.map((coluna) => (
              <th
                key={coluna.chave}
                scope="col"
                className={coluna.alinhamento === "direita" ? styles.direita : undefined}
              >
                {coluna.cabecalho}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={chaveDaLinha(linha)}>
              {colunas.map((coluna) => (
                <td
                  key={coluna.chave}
                  className={coluna.alinhamento === "direita" ? styles.direita : undefined}
                >
                  {coluna.celula
                    ? coluna.celula(linha)
                    : (linha as Record<string, ReactNode>)[coluna.chave]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
