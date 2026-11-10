export type PerfilUsuario =
  | "CLIENTE"
  | "OPERADOR"
  | "GERENTE_LOCADORA"
  | "ADMIN_PLATAFORMA";

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
