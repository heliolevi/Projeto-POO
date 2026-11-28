"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./Modal.module.css";

type ModalProps = {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  children: ReactNode;
  /** Botões de ação, alinhados à direita no rodapé. */
  rodape?: ReactNode;
};

// Usa o <dialog> nativo (foco, camada acima da página e Esc). Quem manda é sempre o pai:
// Esc, clique no fundo e botões só pedem para fechar chamando `onFechar`, uma vez, e o
// <dialog> fecha quando o pai muda `aberto` para false.
export function Modal({ aberto, onFechar, titulo, children, rodape }: ModalProps) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const tituloId = useId();

  useEffect(() => {
    const elemento = dialogo.current;
    if (!elemento) return;
    if (aberto && !elemento.open) elemento.showModal();
    if (!aberto && elemento.open) elemento.close();
  }, [aberto]);

  return (
    <dialog
      ref={dialogo}
      className={styles.dialogo}
      aria-labelledby={tituloId}
      onCancel={(evento) => {
        // Esc: não deixa o navegador fechar sozinho (o pai ficaria com `aberto` desatualizado).
        evento.preventDefault();
        onFechar();
      }}
      onClose={() => {
        // Só chega aqui sem o pai ter pedido se o <dialog> foi fechado por outro caminho
        // (ex.: um formulário com method="dialog"). Quando o pai fecha, `aberto` já é false.
        if (aberto) onFechar();
      }}
      onClick={(evento) => {
        // Clique no fundo escurecido (o próprio <dialog>) pede para fechar; no conteúdo, não.
        if (evento.target === evento.currentTarget) onFechar();
      }}
    >
      <div className={styles.conteudo}>
        <h2 id={tituloId} className={styles.titulo}>
          {titulo}
        </h2>
        <div className={styles.corpo}>{children}</div>
        {rodape && <div className={styles.rodape}>{rodape}</div>}
      </div>
    </dialog>
  );
}
