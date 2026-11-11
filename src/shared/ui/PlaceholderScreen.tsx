export function PlaceholderScreen({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 style={{ fontSize: "var(--font-size-2xl)", fontWeight: "var(--font-weight-bold)" }}>
        {title}
      </h2>
      <p
        style={{
          fontSize: "var(--font-size-md)",
          color: "var(--color-text-support)",
          marginTop: "var(--space-8)",
        }}
      >
        {description}
      </p>
    </div>
  );
}
