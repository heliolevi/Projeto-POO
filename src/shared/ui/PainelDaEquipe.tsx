import Link from "next/link";
import { Card } from "./Card";

// Cartão que a equipe (OPERADOR e ADMIN) vê no início do app enquanto os painéis de
// retirada e devolução não chegam. Não leva a nenhuma tela que responda com erro.
export function PainelDaEquipe({ admin }: { admin: boolean }) {
  const linkStyle = {
    display: "inline-block",
    padding: "var(--space-12) var(--space-20)",
    borderRadius: "var(--radius-pill)",
    background: "var(--color-primary)",
    color: "var(--color-surface)",
    fontWeight: "var(--font-weight-bold)",
    textDecoration: "none",
  } as const;

  return (
    <Card title="Painel da equipe" as="section">
      <p style={{ color: "var(--color-text-support)", marginBottom: "var(--space-16)" }}>
        Retirada, devolução e gestão do catálogo chegam em 19/11.
      </p>
      <div style={{ display: "flex", gap: "var(--space-12)", flexWrap: "wrap" }}>
        {admin && (
          <Link href="/admin" style={linkStyle}>
            Catálogo
          </Link>
        )}
        <Link href="/app/conta" style={linkStyle}>
          Conta
        </Link>
      </div>
    </Card>
  );
}
