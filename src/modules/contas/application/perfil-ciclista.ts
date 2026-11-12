import { ForbiddenError, UnauthorizedError, ValidationError } from "../../../shared/http/errors.ts";
import type { ContaLogada, PerfilCiclistaConta } from "../domain/usuario.ts";
import { validarPerfilCiclista, type DadosPerfilCiclista } from "../domain/validacao.ts";

export type DependenciasPerfilCiclista = {
  buscarConta: (usuarioId: string) => Promise<ContaLogada | null>;
  gravarPerfilCiclista: (
    usuarioId: string,
    dados: DadosPerfilCiclista,
  ) => Promise<PerfilCiclistaConta | null>;
};

export function criarPerfilCiclista(deps: DependenciasPerfilCiclista) {
  // GET /api/conta/me: dados da conta logada e, para cliente, os dados da recomendação.
  async function consultarConta(usuarioId: string): Promise<ContaLogada> {
    const conta = await deps.buscarConta(usuarioId);
    // o exigirSessao já confirmou que a conta existe e está ativa; se sumiu no meio, é 401
    if (!conta) throw new UnauthorizedError("Sessão inválida ou expirada.");
    return conta;
  }

  // PUT /api/conta/perfil-ciclista: o alvo é sempre a conta do token, nunca um id do corpo.
  async function atualizarPerfilCiclista(
    usuarioId: string,
    entrada: unknown,
  ): Promise<PerfilCiclistaConta> {
    const validado = validarPerfilCiclista(entrada);
    if ("erros" in validado) throw new ValidationError("Dados inválidos.", validado.erros);
    const gravado = await deps.gravarPerfilCiclista(usuarioId, validado.dados);
    if (!gravado) throw new ForbiddenError("Só clientes têm perfil de ciclista.");
    return gravado;
  }

  // Dados que a recomendação lê do cliente logado (altura, experiência e atividade preferida).
  async function consultarPerfilCiclista(usuarioId: string): Promise<PerfilCiclistaConta> {
    const conta = await consultarConta(usuarioId);
    if (!conta.ciclista) throw new ForbiddenError("Só clientes têm perfil de ciclista.");
    return conta.ciclista;
  }

  return { consultarConta, atualizarPerfilCiclista, consultarPerfilCiclista };
}
