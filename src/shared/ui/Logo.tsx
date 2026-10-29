type LogoProps = {
  size?: number;
};

export function LogoMark({ size = 32 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="7" cy="23" r="5.5" stroke="var(--color-logo)" strokeWidth="2.4" />
      <circle cx="25" cy="23" r="5.5" stroke="var(--color-logo)" strokeWidth="2.4" />
      <path
        d="M7 23L13 11H19M13 11L17 17M25 23L19 11M19 11L23 17L19 23H11"
        stroke="var(--color-logo)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="13" cy="8.5" r="2.2" fill="var(--color-logo)" />
    </svg>
  );
}

export function Logo({ withSubtitle = false }: { withSubtitle?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <LogoMark />
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--color-primary)", lineHeight: 1.1 }}>
          Bike Ilha Club
        </h1>
        {withSubtitle && (
          <p style={{ fontSize: 12, color: "var(--color-text-support)", marginTop: 2 }}>
            São Luís, MA
          </p>
        )}
      </div>
    </div>
  );
}
