"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { lerSessao, type Sessao } from "@/shared/auth/sessao";
import { AppShell } from "@/shared/ui/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sessao] = useState<Sessao | null>(() => lerSessao());

  useEffect(() => {
    if (!sessao) router.replace("/login");
  }, [sessao, router]);

  if (!sessao) return null;

  return <AppShell perfil={sessao.perfil}>{children}</AppShell>;
}
