"use client";

import { useState } from "react";
import { lerSessao, type PerfilUsuario } from "@/shared/auth/sessao";
import { InicioCliente } from "@/shared/inicio/InicioCliente";
import { PainelDaEquipe } from "@/shared/ui/PainelDaEquipe";

// Início do app: o cliente vê o convite para buscar, suas reservas e as bicicletas da casa;
// a equipe vê os atalhos dos painéis.
export default function AppHomePage() {
  const [perfil] = useState<PerfilUsuario | null>(() => lerSessao()?.perfil ?? null);

  if (!perfil) return null;
  if (perfil === "CLIENTE") return <InicioCliente />;
  return <PainelDaEquipe admin={perfil === "ADMIN"} />;
}
