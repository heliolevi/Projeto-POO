"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { PerfilUsuario } from "@/shared/auth/sessao";
import { limparSessao } from "@/shared/auth/sessao";
import styles from "./AppShell.module.css";
import { itensNavPorPerfil } from "./nav-por-perfil";
import { Logo } from "./Logo";
import { LogoutIcon } from "./icons";

export function AppShell({ perfil, children }: { perfil: PerfilUsuario; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const itens = itensNavPorPerfil(perfil);

  function sair() {
    limparSessao();
    router.push("/login");
  }

  return (
    <div className={styles.page}>
      <div className={styles.screen}>
        <div className={styles.header}>
          <Logo />
          <button className={styles.logoutButton} onClick={sair} aria-label="Sair">
            <LogoutIcon />
          </button>
        </div>

        <div className={styles.content}>{children}</div>

        <nav className={styles.nav}>
          {itens.map((item) => {
            const ativo = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${ativo ? styles.navItemActive : ""}`}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
