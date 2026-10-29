import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./AuthLayout.module.css";
import { Logo } from "./Logo";

type AuthLayoutProps = {
  children: ReactNode;
  eyebrow?: string;
  title: string;
  subtitle: string;
  showBanner?: boolean;
  backHref?: string;
  footer?: ReactNode;
};

export function AuthLayout({
  children,
  eyebrow,
  title,
  subtitle,
  showBanner = false,
  backHref,
  footer,
}: AuthLayoutProps) {
  return (
    <div className={styles.page}>
      <div className={styles.screen}>
        <div className={styles.header}>
          {backHref && (
            <Link href={backHref} className={styles.backButton} aria-label="Voltar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M15 19l-7-7 7-7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          )}
          <Logo withSubtitle />
        </div>

        <div className={styles.content}>
          {showBanner && (
            <div className={styles.banner}>
              <span className={styles.bannerTag}>📍 Sua ilha, no seu ritmo</span>
            </div>
          )}

          {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}

          <h2 className={styles.title}>{title}</h2>
          <p className={styles.subtitle}>{subtitle}</p>

          {children}

          {footer && <div className={styles.footer}>{footer}</div>}
        </div>
      </div>
    </div>
  );
}
