import { useId, type ReactNode } from "react";
import styles from "./Escolha.module.css";

export type OpcaoDeEscolha = {
  valor: string;
  /** Texto principal da opção. */
  rotulo: string;
  /** Frase de apoio (só nos cartões). */
  detalhe?: string;
  /** Conteúdo próprio no lugar do rótulo (ex.: o dia da semana em cima do número). */
  conteudo?: ReactNode;
  /** Leitura para leitor de tela quando o conteúdo visual é curto demais (ex.: "sábado, 15 de novembro"). */
  rotuloAcessivel?: string;
  desabilitada?: boolean;
};

type EscolhaProps = {
  legenda: string;
  /** Texto pequeno ao lado da legenda (ex.: "opcional"). */
  complemento?: string;
  opcoes: OpcaoDeEscolha[];
  valor: string;
  aoMudar: (valor: string) => void;
  /** chip: botões curtos; dia: fileira de dias com rolagem; cartao: opções com uma frase de apoio. */
  formato: "chip" | "dia" | "cartao";
  erro?: string;
  /** Mostrar a legenda só para leitor de tela (quando a tela já tem um título visível). */
  legendaOculta?: boolean;
};

// Grupo de opções feito de <input type="radio"> de verdade: setas do teclado trocam a opção,
// o leitor de tela anuncia "1 de 7" e o formulário funciona sem JavaScript extra.
export function Escolha({
  legenda,
  complemento,
  opcoes,
  valor,
  aoMudar,
  formato,
  erro,
  legendaOculta,
}: EscolhaProps) {
  const nome = useId();
  const idErro = `${nome}-erro`;

  return (
    <fieldset className={styles.grupo} aria-describedby={erro ? idErro : undefined}>
      <legend className={legendaOculta ? styles.somenteLeitor : styles.legenda}>
        {legenda}
        {complemento && <span className={styles.complemento}> {complemento}</span>}
      </legend>

      <div className={`${styles.opcoes} ${styles[`opcoes_${formato}`]}`}>
        {opcoes.map((opcao) => (
          <label key={opcao.valor} className={`${styles.opcao} ${styles[`opcao_${formato}`]}`}>
            <input
              type="radio"
              className={styles.radio}
              name={nome}
              value={opcao.valor}
              checked={valor === opcao.valor}
              disabled={opcao.desabilitada}
              onChange={() => aoMudar(opcao.valor)}
              aria-label={opcao.rotuloAcessivel}
            />
            <span className={styles.corpo}>
              {opcao.conteudo ?? (
                <>
                  <span className={styles.rotulo}>{opcao.rotulo}</span>
                  {opcao.detalhe && <span className={styles.detalhe}>{opcao.detalhe}</span>}
                </>
              )}
              {formato === "cartao" && (
                <span className={styles.marca} aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
                    <path
                      d="M3.5 8.5l3 3 6-7"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              )}
            </span>
          </label>
        ))}
      </div>

      {erro && (
        <p id={idErro} className={styles.erro} role="alert">
          {erro}
        </p>
      )}
    </fieldset>
  );
}
