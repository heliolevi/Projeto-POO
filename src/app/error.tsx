"use client";

import { EmptyState } from "@/shared/ui/EmptyState";
import { Logo } from "@/shared/ui/Logo";

// Rede de segurança: qualquer erro inesperado ao desenhar uma tela cai aqui, em vez da página
// em branco. A mensagem técnica não é mostrada à pessoa.
export default function ErroInesperado({ reset }: { error: Error; reset: () => void }) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "var(--space-24)",
        background: "var(--color-bg-lavender)",
      }}
    >
      <div style={{ display: "grid", gap: "var(--space-8)", justifyItems: "center" }}>
        <Logo />
        <EmptyState
          title="Algo deu errado"
          action={
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "var(--space-12) var(--space-20)",
                borderRadius: "var(--radius-pill)",
                border: "none",
                background: "var(--color-primary)",
                color: "var(--color-surface)",
                fontWeight: "var(--font-weight-bold)",
                fontSize: "var(--font-size-md)",
                cursor: "pointer",
              }}
            >
              Tentar de novo
            </button>
          }
        >
          Não foi possível mostrar esta tela. Tente de novo; se continuar, volte mais tarde.
        </EmptyState>
      </div>
    </main>
  );
}
