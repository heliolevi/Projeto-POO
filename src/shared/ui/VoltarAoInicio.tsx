"use client";

import Link from "next/link";
import { useSessao } from "@/shared/auth/use-sessao";

// Quem está logado volta para o app; visitante, para a página inicial.
export function VoltarAoInicio() {
  const { sessao } = useSessao();

  return (
    <Link
      href={sessao ? "/app" : "/"}
      style={{
        display: "inline-block",
        padding: "var(--space-12) var(--space-20)",
        borderRadius: "var(--radius-pill)",
        background: "var(--color-primary)",
        color: "var(--color-surface)",
        fontWeight: "var(--font-weight-bold)",
        textDecoration: "none",
      }}
    >
      {sessao ? "Voltar para o app" : "Voltar para o início"}
    </Link>
  );
}
