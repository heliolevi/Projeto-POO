// JSX usado pelo next/og (satori) para gerar os ícones do PWA. Cores fixas porque
// variáveis CSS não resolvem nesse contexto de renderização.
export function BikeIconOg({
  background,
  foreground = "#FFFFFF",
  padding = 0,
}: {
  background: string;
  foreground?: string;
  padding?: number;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding,
        background,
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 32 32" fill="none">
        <circle cx="7" cy="23" r="5.5" stroke={foreground} strokeWidth="2.4" />
        <circle cx="25" cy="23" r="5.5" stroke={foreground} strokeWidth="2.4" />
        <path
          d="M7 23L13 11H19M13 11L17 17M25 23L19 11M19 11L23 17L19 23H11"
          stroke={foreground}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="13" cy="8.5" r="2.2" fill={foreground} />
      </svg>
    </div>
  );
}
