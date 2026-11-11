"use client";

import { useGuardaRota } from "@/shared/auth/guarda-rota";
import { SiteLayout } from "@/shared/ui/SiteLayout";
import { PlaceholderScreen } from "@/shared/ui/PlaceholderScreen";

export default function AdminPage() {
  const sessao = useGuardaRota();
  if (!sessao) return null;

  return (
    <SiteLayout>
      <PlaceholderScreen title="Admin" description="Esta tela ainda está em construção." />
    </SiteLayout>
  );
}
