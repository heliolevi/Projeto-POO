"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { lerSessao, type PerfilUsuario } from "@/shared/auth/sessao";
import { PainelDaEquipe } from "@/shared/ui/PainelDaEquipe";

// O cliente cai direto na Busca; a equipe vê o cartão do painel.
export default function AppHomePage() {
  const router = useRouter();
  const [perfil] = useState<PerfilUsuario | null>(() => lerSessao()?.perfil ?? null);

  useEffect(() => {
    if (perfil === "CLIENTE") router.replace("/app/buscar");
  }, [perfil, router]);

  if (!perfil || perfil === "CLIENTE") return null;

  return <PainelDaEquipe admin={perfil === "ADMIN"} />;
}
