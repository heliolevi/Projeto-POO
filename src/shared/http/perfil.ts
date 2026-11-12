import type { PerfilSessao } from "../db/sessao.ts";
import { ForbiddenError } from "./errors.ts";

// Confere o perfil DEPOIS do login, nesta ordem para seguir o contrato da API: sem sessão válida é
// 401 (exigirSessao, do módulo contas) e, logado com o perfil errado, 403 (esta função). Devolve a
// mesma sessão com o perfil já estreitado, para a rota usar sem novas checagens:
//   const sessao = exigirPerfil(await exigirSessao(request), "OPERADOR", "ADMIN");
//
// Fica em shared (e o módulo contas a reexporta) porque ela não depende de nada de contas, e assim
// os módulos que a usam nas rotas (catalogo, recomendacao...) podem testar que as rotas a chamam,
// com a função de verdade e não com uma cópia.
export function exigirPerfil<S extends { perfil: PerfilSessao }, P extends PerfilSessao>(
  sessao: S,
  ...permitidos: [P, ...P[]]
): S & { perfil: P } {
  if (!(permitidos as readonly PerfilSessao[]).includes(sessao.perfil)) {
    throw new ForbiddenError("Seu perfil não tem acesso a esta ação.");
  }
  return sessao as S & { perfil: P };
}
