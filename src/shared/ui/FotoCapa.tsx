import Image from "next/image";
import type { ReactNode } from "react";
import type { FotoBicicleta } from "@/shared/landing/fotos";
import styles from "./FotoCapa.module.css";

type FotoCapaProps = {
  foto: FotoBicicleta;
  /** Formato da moldura: capa (grande), cartao (16:10), faixa (largo e baixo) ou miniatura (quadrada). */
  formato?: "capa" | "cartao" | "faixa" | "miniatura";
  /** Dica de tamanho para o navegador baixar a imagem certa (atributo sizes). */
  sizes: string;
  /** Só a primeira imagem da tela, a que aparece sem rolar, deve ser prioritária. */
  priority?: boolean;
  /** Conteúdo sobre a foto (título, botão). Fica sobre um degradê verde para manter o contraste. */
  children?: ReactNode;
  className?: string;
};

// A moldura tem proporção fixa: a foto carrega sem empurrar o resto da tela.
export function FotoCapa({
  foto,
  formato = "cartao",
  sizes,
  priority,
  children,
  className,
}: FotoCapaProps) {
  const classes = [styles.moldura, styles[formato], className ?? ""].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      <Image
        className={styles.imagem}
        src={foto.src}
        alt={foto.alt}
        fill
        sizes={sizes}
        priority={priority}
      />
      {children && <div className={styles.cobertura}>{children}</div>}
    </div>
  );
}
