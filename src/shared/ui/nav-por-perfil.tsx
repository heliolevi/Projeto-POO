import type { ReactNode } from "react";
import type { PerfilUsuario } from "@/shared/auth/sessao";
import { CalendarIcon, HomeIcon, UserIcon } from "./icons";

export type ItemNav = { href: string; label: string; icon: ReactNode };

const INICIO: ItemNav = { href: "/app", label: "Início", icon: <HomeIcon /> };
const RESERVAS: ItemNav = { href: "/app/reservas", label: "Reservas", icon: <CalendarIcon /> };
const PERFIL: ItemNav = { href: "/app/perfil", label: "Perfil", icon: <UserIcon /> };

const NAV_POR_PERFIL: Record<PerfilUsuario, ItemNav[]> = {
  CLIENTE: [INICIO, RESERVAS, PERFIL],
  OPERADOR: [INICIO, RESERVAS, PERFIL],
  ADMIN: [INICIO, RESERVAS, PERFIL],
};

export function itensNavPorPerfil(perfil: PerfilUsuario): ItemNav[] {
  return NAV_POR_PERFIL[perfil];
}
