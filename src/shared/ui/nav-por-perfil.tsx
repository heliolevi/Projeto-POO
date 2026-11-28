import type { ReactNode } from "react";
import type { PerfilUsuario } from "@/shared/auth/sessao";
import { CalendarIcon, HomeIcon, LockIcon, SearchIcon, ShieldIcon, UserIcon } from "./icons";

export type ItemNav = { href: string; label: string; icon: ReactNode };

const INICIO: ItemNav = { href: "/app", label: "Início", icon: <HomeIcon /> };
const BUSCAR: ItemNav = { href: "/app/buscar", label: "Buscar", icon: <SearchIcon /> };
const RESERVAS: ItemNav = { href: "/app/reservas", label: "Reservas", icon: <CalendarIcon /> };
const PERFIL: ItemNav = { href: "/app/perfil", label: "Perfil", icon: <UserIcon /> };
const CONTA: ItemNav = { href: "/app/conta", label: "Conta", icon: <LockIcon /> };

const OPERACAO: ItemNav = { href: "/app/operacao", label: "Operação", icon: <CalendarIcon /> };
const CATALOGO: ItemNav = { href: "/admin", label: "Catálogo", icon: <ShieldIcon /> };

// A busca usa a recomendação e a API de reservas só atende o cliente (para a equipe dá 403),
// então a equipe não vê esses itens. O catálogo (/admin) é só do ADMIN.
const NAV_POR_PERFIL: Record<PerfilUsuario, ItemNav[]> = {
  CLIENTE: [INICIO, BUSCAR, RESERVAS, PERFIL, CONTA],
  OPERADOR: [INICIO, OPERACAO, PERFIL, CONTA],
  ADMIN: [INICIO, OPERACAO, CATALOGO, PERFIL, CONTA],
};

export function itensNavPorPerfil(perfil: PerfilUsuario): ItemNav[] {
  return NAV_POR_PERFIL[perfil];
}
