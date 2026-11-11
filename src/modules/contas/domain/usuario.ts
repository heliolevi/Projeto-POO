// Perfis do modelo de uma única locadora (migration 0004): o cliente, quem atende no balcão
// (OPERADOR) e quem administra a loja (ADMIN).
export const PERFIS = ["CLIENTE", "OPERADOR", "ADMIN"] as const;
export type PerfilUsuario = (typeof PERFIS)[number];

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
export const VERSAO_TERMOS_ATUAL = "2026-11";

export function documentoValido(documentoChave: string | null): boolean {
  return documentoChave !== null;
}
