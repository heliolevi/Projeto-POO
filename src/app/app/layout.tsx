"use client";

import { useGuardaRota } from "@/shared/auth/guarda-rota";
import { AppShell } from "@/shared/ui/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // A sessão só existe no navegador (localStorage). Enquanto não foi lida, `carregando` vale
  // true e a tela fica vazia, igual no servidor e na hidratação. Ler o localStorage direto no
  // primeiro render fazia o cliente desenhar o shell onde o servidor desenhou nada, e o React
  // descartava e refazia a árvore inteira ("Hydration failed").
  const { sessao, carregando } = useGuardaRota();

  if (carregando || !sessao) return null;

  return <AppShell perfil={sessao.perfil}>{children}</AppShell>;
}
