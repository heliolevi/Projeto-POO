import type { PerfilSessao } from "../db/sessao.ts";
import { ForbiddenError } from "./errors.ts";

// Os perfis que podem usar uma rota. Confere o perfil DEPOIS do login, nesta ordem para seguir o
// contrato da API: sem sessão válida é 401 (exigirSessao, do módulo contas) e, logado com o perfil
// errado, 403 (esta classe). Devolve a mesma sessão com o perfil já estreitado, para a rota usar
// sem novas checagens:
//   const soEquipe = new PerfisPermitidos("OPERADOR", "ADMIN");
//   const sessao = soEquipe.exigir(await exigirSessao(request));
//
// Fica em shared porque não depende de nada de contas, e assim os módulos que a usam nas rotas
// (catalogo, recomendacao...) podem testar que as rotas a chamam, com a classe de verdade.
export class PerfisPermitidos<P extends PerfilSessao> {
  readonly #permitidos: readonly P[];

  constructor(...permitidos: [P, ...P[]]) {
    this.#permitidos = [...permitidos];
  }

  permite(perfil: PerfilSessao | null): boolean {
    return perfil !== null && (this.#permitidos as readonly PerfilSessao[]).includes(perfil);
  }

  exigir<S extends { perfil: PerfilSessao }>(sessao: S): S & { perfil: P } {
    if (!this.permite(sessao.perfil)) {
      throw new ForbiddenError("Seu perfil não tem acesso a esta ação.");
    }
    return sessao as S & { perfil: P };
  }
}
