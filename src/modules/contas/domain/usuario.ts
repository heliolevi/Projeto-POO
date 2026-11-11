// Perfis do modelo de uma única locadora (migration 0004): o cliente, quem atende no balcão
// (OPERADOR) e quem administra a loja (ADMIN).
export const PERFIS = ["CLIENTE", "OPERADOR", "ADMIN"] as const;
export type PerfilUsuario = (typeof PERFIS)[number];

import type { Atividade, Experiencia } from "../../../shared/dominio/ciclista.ts";

export type UsuarioPublico = {
  id: string;
  perfil: PerfilUsuario;
  nome: string;
  email: string;
};

export type UsuarioComSenha = UsuarioPublico & {
  senhaHash: string;
  ativo: boolean;
};

// Versão dos termos de uso aceita no cadastro. Muda quando os termos mudarem.
export const VERSAO_TERMOS_ATUAL = "2026-10";

export function documentoValido(documentoChave: string | null): boolean {
  return documentoChave !== null;
}

// Dados do ciclista que a recomendação usa. Qualquer um pode estar em branco.
export type PerfilCiclistaConta = {
  alturaCm: number | null;
  experiencia: Experiencia | null;
  atividade: Atividade | null;
};

// O que GET /api/conta/me devolve. `ciclista` só existe para CLIENTE.
export type ContaLogada = UsuarioPublico & { ciclista?: PerfilCiclistaConta };

