import Link from "next/link";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Logo } from "@/shared/ui/Logo";

export default function NaoEncontrada() {
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
          title="Página não encontrada"
          action={
            <Link
              href="/"
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
              Voltar para o início
            </Link>
          }
        >
          O endereço não existe ou mudou de lugar.
        </EmptyState>
      </div>
    </main>
  );
}
