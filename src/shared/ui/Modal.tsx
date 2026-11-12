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

// Usa o <dialog> nativo: o navegador cuida do foco, da camada acima da página e do Esc.
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
      onClose={onFechar}
      onClick={(evento) => {
        // Clique no fundo escurecido (o próprio <dialog>) fecha; clique no conteúdo não.
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
