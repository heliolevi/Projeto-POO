import type { ReactNode } from "react";
import styles from "./SiteLayout.module.css";
import { SiteHeader } from "./SiteHeader";

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.screen}>
        <SiteHeader />
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
