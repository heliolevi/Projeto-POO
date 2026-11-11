"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { lerSessao, limparSessao, type PerfilUsuario, type Sessao } from "@/shared/auth/sessao";
import styles from "./SiteHeader.module.css";
import { Logo } from "./Logo";
import { CalendarIcon, LogoutIcon, SearchIcon, ShieldIcon, UserIcon } from "./icons";

type LinkNav = { href: string; label: string; icon: ReactNode };

const BUSCAR: LinkNav = { href: "/buscar", label: "Buscar", icon: <SearchIcon /> };
const MINHAS_RESERVAS: LinkNav = {
  href: "/minhas-reservas",
  label: "Minhas reservas",
  icon: <CalendarIcon />,
};
const PERFIL: LinkNav = { href: "/perfil", label: "Perfil", icon: <UserIcon /> };
const ADMIN: LinkNav = { href: "/admin", label: "Admin", icon: <ShieldIcon /> };

function linksPorEstado(perfil: PerfilUsuario | null): LinkNav[] {
  if (!perfil) return [BUSCAR];
  if (perfil === "CLIENTE") return [BUSCAR, MINHAS_RESERVAS, PERFIL];
  return [BUSCAR, ADMIN, PERFIL];
}

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [sessao, setSessao] = useState<Sessao | null>(() => lerSessao());
  const links = linksPorEstado(sessao?.perfil ?? null);

  function sair() {
    limparSessao();
    setSessao(null);
    router.push("/login");
  }

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logoLink}>
        <Logo />
      </Link>

      <nav className={styles.nav}>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`${styles.navLink} ${pathname === link.href ? styles.navLinkActive : ""}`}
          >
            {link.icon}
            {link.label}
          </Link>
        ))}
      </nav>

      {sessao ? (
        <button className={styles.logoutButton} onClick={sair} aria-label="Sair">
          <LogoutIcon />
        </button>
      ) : (
        <div className={styles.visitanteLinks}>
          <Link href="/login" className={styles.entrarLink}>
            Entrar
          </Link>
          <Link href="/cadastro" className={styles.criarContaLink}>
            Criar conta
          </Link>
        </div>
      )}
    </header>
  );
}
