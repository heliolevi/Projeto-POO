import type { ReactNode } from "react";
import type { PerfilUsuario } from "@/shared/auth/sessao";
import { BuildingIcon, CalendarIcon, HomeIcon, UserIcon } from "./icons";

export type ItemNav = { href: string; label: string; icon: ReactNode };

const INICIO: ItemNav = { href: "/app", label: "Início", icon: <HomeIcon /> };
const RESERVAS: ItemNav = { href: "/app/reservas", label: "Reservas", icon: <CalendarIcon /> };
const LOCADORAS: ItemNav = { href: "/app/locadoras", label: "Locadoras", icon: <BuildingIcon /> };
const PERFIL: ItemNav = { href: "/app/perfil", label: "Perfil", icon: <UserIcon /> };

const NAV_POR_PERFIL: Record<PerfilUsuario, ItemNav[]> = {
  CLIENTE: [INICIO, RESERVAS, PERFIL],
  OPERADOR: [INICIO, RESERVAS, PERFIL],
  GERENTE_LOCADORA: [INICIO, RESERVAS, PERFIL],
  ADMIN_PLATAFORMA: [INICIO, LOCADORAS, PERFIL],
};

export function itensNavPorPerfil(perfil: PerfilUsuario): ItemNav[] {
  return NAV_POR_PERFIL[perfil];
}
