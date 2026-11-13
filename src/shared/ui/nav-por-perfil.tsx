import type { ReactNode } from "react";
import type { PerfilUsuario } from "@/shared/auth/sessao";
import { CalendarIcon, HomeIcon, SearchIcon, UserIcon } from "./icons";

export type ItemNav = { href: string; label: string; icon: ReactNode };

const INICIO: ItemNav = { href: "/app", label: "Início", icon: <HomeIcon /> };
const BUSCAR: ItemNav = { href: "/app/buscar", label: "Buscar", icon: <SearchIcon /> };
const RESERVAS: ItemNav = { href: "/app/reservas", label: "Reservas", icon: <CalendarIcon /> };
const PERFIL: ItemNav = { href: "/app/perfil", label: "Perfil", icon: <UserIcon /> };

// A busca usa a recomendação, que é só do cliente.
const NAV_POR_PERFIL: Record<PerfilUsuario, ItemNav[]> = {
  CLIENTE: [INICIO, BUSCAR, RESERVAS, PERFIL],
  OPERADOR: [INICIO, RESERVAS, PERFIL],
  ADMIN: [INICIO, RESERVAS, PERFIL],
};

export function itensNavPorPerfil(perfil: PerfilUsuario): ItemNav[] {
  return NAV_POR_PERFIL[perfil];
}
