"use client";

import Link from "next/link";
import { useSessao } from "@/shared/auth/use-sessao";
import { Logo } from "@/shared/ui/Logo";
import styles from "./landing.module.css";

// Antes de ler o localStorage (e no servidor) mostra os links de visitante.
export function LandingHeader() {
  const { sessao } = useSessao();

  return (
    <header className={styles.cabecalho}>
      <Link href="/" className={styles.logoLink} aria-label="Bike Ilha Club, página inicial">
        <Logo as="span" />
      </Link>
      <nav className={styles.acoesCabecalho} aria-label="Acesso">
        {sessao ? (
          <Link href="/app" className={styles.botao}>
            Abrir o app
          </Link>
        ) : (
          <>
            <Link href="/login" className={styles.linkTexto}>
              Entrar
            </Link>
            <Link href="/cadastro" className={styles.botao}>
              Criar conta
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

export function ChamadasDoHeroi() {
  const { sessao } = useSessao();

  return (
    <div className={styles.chamadas}>
      {sessao ? (
        <Link href="/app/buscar" className={styles.botao}>
          Buscar uma bicicleta
        </Link>
      ) : (
        <>
          <Link href="/cadastro" className={styles.botao}>
            Criar conta e começar
          </Link>
          <Link href="/login" className={styles.botaoSecundario}>
            Já tenho conta
          </Link>
        </>
      )}
    </div>
  );
}
