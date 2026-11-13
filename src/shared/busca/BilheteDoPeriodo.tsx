import type { PontaDoPeriodo } from "./agenda";
import styles from "./Busca.module.css";

type BilheteProps = {
  retirada: PontaDoPeriodo;
  devolucao: PontaDoPeriodo;
  duracao: string;
  ponto: string;
};

// O resumo do período no formato do bilhete do balcão: a hora de retirada e a de devolução,
// com o dia embaixo de cada uma, e o picote separando o rodapé.
export function BilheteDoPeriodo({ retirada, devolucao, duracao, ponto }: BilheteProps) {
  return (
    <section className={styles.bilhete} aria-label="Resumo do período" aria-live="polite">
      <div className={styles.bilheteTrecho}>
        <div className={styles.bilhetePonta}>
          <span className={styles.bilheteRotulo}>Retirada</span>
          <strong className={styles.bilheteHora}>{retirada.hora}</strong>
          <span className={styles.bilheteDia}>{retirada.dia}</span>
        </div>
        <span className={styles.bilheteTrajeto} aria-hidden="true" />
        <div className={`${styles.bilhetePonta} ${styles.bilhetePontaFim}`}>
          <span className={styles.bilheteRotulo}>Devolução</span>
          <strong className={styles.bilheteHora}>{devolucao.hora}</strong>
          <span className={styles.bilheteDia}>{devolucao.dia}</span>
        </div>
      </div>
      <div className={styles.bilhetePicote} aria-hidden="true" />
      <p className={styles.bilheteRodape}>
        <span>{duracao}</span>
        <span>{ponto}</span>
      </p>
    </section>
  );
}
