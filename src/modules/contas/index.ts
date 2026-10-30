/**
 * Módulo contas — Cadastro e autenticação de clientes, operadores e administradores; documento e aceite dos termos; perfis de acesso.
 *
 * API pública do módulo: apenas o que for exportado aqui pode ser importado por
 * outros módulos ou pelos Route Handlers em src/app/api.
 * Camadas internas: domain → application → infrastructure / http.
 */
import { criarExigirSessao } from "./application/exigir-sessao";
import { buscarSituacaoPorId } from "./infrastructure/repositorio-usuarios";

export {
  postAceitarTermos,
  postAlterarSenha,
  postAtualizarAltura,
  postCadastro,
  postDesativar,
  postLogin,
} from "./http/handlers";
export { verificarToken, type SessaoToken } from "./infrastructure/token";
export type { SessaoAtiva } from "./application/exigir-sessao";
export type { PerfilUsuario, UsuarioPublico } from "./domain/usuario";

// Para rotas que exigem login (header Authorization: Bearer <token>). Lança 401 se o token
// for inválido ou expirado, ou se a conta tiver sido desativada.
export const exigirSessao = criarExigirSessao(buscarSituacaoPorId);
