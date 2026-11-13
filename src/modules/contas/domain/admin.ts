import { PERMISSOES_DO_OPERADOR } from "./operador.ts";
import { Usuario, type DadosUsuario, type Permissao } from "./usuario-base.ts";
import type { PerfilUsuario } from "./usuario.ts";

// O administrador faz tudo o que o operador faz e mais a gestão da loja.
export const PERMISSOES_DO_ADMIN: readonly Permissao[] = [
  ...PERMISSOES_DO_OPERADOR,
  "ocorrencia:resolver",
  "catalogo:gerir",
  "empresa:editar",
  "auditoria:consultar",
];

export class Admin extends Usuario {
  constructor(dados: DadosUsuario) {
    super(dados);
  }

  get perfil(): PerfilUsuario {
    return "ADMIN";
  }

  permissoes(): readonly Permissao[] {
    return PERMISSOES_DO_ADMIN;
  }
}
