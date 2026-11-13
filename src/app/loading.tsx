import { LogoMark } from "@/shared/ui/Logo";

// Carregando global: aparece enquanto uma rota ainda está sendo montada.
export default function Carregando() {
  return (
    <main
      aria-busy="true"
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        gap: "var(--space-12)",
        alignContent: "center",
        background: "var(--color-bg-lavender)",
        color: "var(--color-text-support)",
      }}
    >
      <LogoMark size={40} />
      <p role="status">Carregando...</p>
    </main>
  );
}
