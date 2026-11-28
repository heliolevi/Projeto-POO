import { ForbiddenError, UnauthorizedError, ValidationError } from "../../../shared/http/errors.ts";
import type { ContaLogada, PerfilCiclistaConta } from "../domain/usuario.ts";
import type { ValidadorDeConta } from "../domain/validador-de-conta.ts";
import type { ArmazemDeUsuarios } from "./portas.ts";

export type DependenciasDoPerfil = {
  usuarios: Pick<ArmazemDeUsuarios, "buscarConta" | "gravarPerfilCiclista">;
  validador: Pick<ValidadorDeConta, "perfilCiclista">;
};

// A conta logada e os dados do ciclista (altura, experiência e atividade preferida) que a
// recomendação lê.
export class PerfilDoCiclista {
  readonly #deps: DependenciasDoPerfil;

  constructor(deps: DependenciasDoPerfil) {
    this.#deps = deps;
  }

  /** GET /api/conta/me: dados da conta logada e, para cliente, os dados da recomendação. */
  async consultarConta(usuarioId: string): Promise<ContaLogada> {
    const conta = await this.#deps.usuarios.buscarConta(usuarioId);
    // a SessaoDaRequisicao já confirmou que a conta existe e está ativa; se sumiu no meio, é 401
    if (!conta) throw new UnauthorizedError("Sessão inválida ou expirada.");
    return conta;
  }

  /** PUT /api/conta/perfil-ciclista: o alvo é sempre a conta do token, nunca um id do corpo. */
  async atualizar(usuarioId: string, entrada: unknown): Promise<PerfilCiclistaConta> {
    const validado = this.#deps.validador.perfilCiclista(entrada);
    if ("erros" in validado) throw new ValidationError("Dados inválidos.", validado.erros);
    const gravado = await this.#deps.usuarios.gravarPerfilCiclista(usuarioId, validado.dados);
    if (!gravado) throw new ForbiddenError("Só clientes têm perfil de ciclista.");
    return gravado;
  }

  /** Dados que a recomendação lê do cliente logado. */
  async consultar(usuarioId: string): Promise<PerfilCiclistaConta> {
    const conta = await this.consultarConta(usuarioId);
    if (!conta.ciclista) throw new ForbiddenError("Só clientes têm perfil de ciclista.");
    return conta.ciclista;
  }
}
