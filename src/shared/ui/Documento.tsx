import type { ReactNode } from "react";
import Link from "next/link";
import { legendaDaTabela, lerMarkdown, lerTrechos, type Bloco } from "@/shared/markdown/markdown";
import { Alert } from "./Alert";
import { Table } from "./Table";
import styles from "./Documento.module.css";

function Texto({ texto }: { texto: string }) {
  return (
    <>
      {lerTrechos(texto).map((t, i) => {
        if (t.tipo === "forte") return <strong key={i}>{t.texto}</strong>;
        if (t.tipo === "link") {
          return t.href.startsWith("/") ? (
            <Link key={i} href={t.href}>
              {t.texto}
            </Link>
          ) : (
            <a key={i} href={t.href} rel="noopener noreferrer">
              {t.texto}
            </a>
          );
        }
        return t.texto;
      })}
    </>
  );
}

function BlocoView({ bloco, legenda }: { bloco: Bloco; legenda: string }): ReactNode {
  switch (bloco.tipo) {
    case "titulo": {
      const Tag = bloco.nivel === 1 ? "h1" : "h2";
      return (
        <Tag className={bloco.nivel === 1 ? styles.titulo : styles.secao}>
          <Texto texto={bloco.texto} />
        </Tag>
      );
    }
    case "paragrafo":
      return (
        <p className={styles.paragrafo}>
          <Texto texto={bloco.texto} />
        </p>
      );
    case "citacao":
      return (
        <Alert variant="info">
          <Texto texto={bloco.texto} />
        </Alert>
      );
    case "lista": {
      const Tag = bloco.ordenada ? "ol" : "ul";
      return (
        <Tag className={styles.lista}>
          {bloco.itens.map((item, i) => (
            <li key={i}>
              <Texto texto={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "tabela": {
      const linhas = bloco.linhas.map((l) => Object.fromEntries(l.map((c, i) => [`c${i}`, c])));
      const colunas = bloco.cabecalho.map((cabecalho, i) => ({
        chave: `c${i}`,
        cabecalho,
        celula: (linha: Record<string, string>) => <Texto texto={linha[`c${i}`] ?? ""} />,
      }));
      return (
        <Table
          legenda={legenda}
          colunas={colunas}
          linhas={linhas}
          chaveDaLinha={(linha) => linha.c0}
        />
      );
    }
  }
}

/** Mostra um documento Markdown (termos, política) com os componentes do design system. */
export function Documento({ markdown }: { markdown: string }) {
  const blocos = lerMarkdown(markdown);
  return (
    <article className={styles.documento}>
      {blocos.map((bloco, i) => (
        <BlocoView key={i} bloco={bloco} legenda={bloco.tipo === "tabela" ? legendaDaTabela(blocos, i) : ""} />
      ))}
    </article>
  );
}
