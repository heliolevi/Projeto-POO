import { EmptyState } from "@/shared/ui/EmptyState";
import { LogoMark } from "@/shared/ui/Logo";
import { VoltarAoInicio } from "@/shared/ui/VoltarAoInicio";

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
        <LogoMark size={40} />
        <EmptyState title="Página não encontrada" as="h1" action={<VoltarAoInicio />}>
          O endereço não existe ou mudou de lugar.
        </EmptyState>
      </div>
    </main>
  );
}
