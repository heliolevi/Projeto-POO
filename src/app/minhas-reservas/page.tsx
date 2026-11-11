"use client";

import { useGuardaRota } from "@/shared/auth/guarda-rota";
import { SiteLayout } from "@/shared/ui/SiteLayout";
import { PlaceholderScreen } from "@/shared/ui/PlaceholderScreen";

export default function MinhasReservasPage() {
  const sessao = useGuardaRota();
  if (!sessao) return null;

  return (
    <SiteLayout>
      <PlaceholderScreen title="Minhas reservas" description="Esta tela ainda está em construção." />
    </SiteLayout>
  );
}
