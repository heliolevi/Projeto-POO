/**
 * Módulo contas — Cadastro e autenticação de clientes, operadores e administradores; documento e aceite dos termos; perfis de acesso.
 *
 * API pública do módulo: apenas o que for exportado aqui pode ser importado por
 * outros módulos ou pelos Route Handlers em src/app/api.
 * Camadas internas: domain → application → infrastructure / http.
 */
export {
  postAceitarTermos,
  postAlterarSenha,
  postAtualizarAltura,
  postCadastro,
  postDesativar,
  postLogin,
} from "./http/handlers";
export { verificarToken, type SessaoToken } from "./infrastructure/token";
export { exigirPerfil, type SessaoAtiva } from "./application/exigir-sessao";
export { PERFIS, type PerfilUsuario, type UsuarioPublico } from "./domain/usuario";

// Rotas que exigem login: `const sessao = await exigirSessao(request)` (401 se não houver
// sessão válida). Para restringir o perfil: `exigirPerfil(sessao, "OPERADOR", "ADMIN")` (403).
export { exigirSessao } from "./http/sessao";
