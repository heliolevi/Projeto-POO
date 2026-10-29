import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>Bike Ilha Club</h1>
      <p>
        <Link href="/login">Entrar</Link> · <Link href="/cadastro">Criar conta</Link>
      </p>
    </main>
  );
}
