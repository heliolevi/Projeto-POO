"use client";

import { useState } from "react";
import { lerSessao, type PerfilUsuario } from "@/shared/auth/sessao";
import { PlaceholderScreen } from "@/shared/ui/PlaceholderScreen";

const TITULO_POR_PERFIL: Record<PerfilUsuario, string> = {
  CLIENTE: "Que bom te ver de novo!",
  OPERADOR: "Painel da equipe",
  GERENTE_LOCADORA: "Painel da equipe",
  ADMIN_PLATAFORMA: "Painel da plataforma",
};

export default function AppHomePage() {
  const [perfil] = useState<PerfilUsuario | null>(() => lerSessao()?.perfil ?? null);

  if (!perfil) return null;

  return (
    <PlaceholderScreen
      title={TITULO_POR_PERFIL[perfil]}
      description="Esta tela ainda está em construção."
    />
  );
}
