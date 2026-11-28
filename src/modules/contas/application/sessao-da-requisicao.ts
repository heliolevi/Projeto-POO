import { Uuid } from "../../../shared/dominio/uuid.ts";
import { UnauthorizedError } from "../../../shared/http/errors.ts";
import { PERFIS } from "../domain/usuario.ts";
import type { ArmazemDeUsuarios, SessaoAtiva, TokensDeSessao } from "./portas.ts";

export { PerfisPermitidos } from "../../../shared/http/perfis-permitidos.ts";
export type { SessaoAtiva } from "./portas.ts";

const MENSAGEM = "Sessão inválida ou expirada.";

export type DependenciasDaSessao = {
  tokens: Pick<TokensDeSessao, "verificar">;
  usuarios: Pick<ArmazemDeUsuarios, "buscarSituacaoPorId">;
};

// Usada pelas rotas que exigem login: `const sessao = await sessoes.exigir(request)`.
// Além de validar o token, confere no banco se a conta continua ativa, porque o token
// não pode ser revogado. O perfil devolvido é o do banco, não o que estava no token,
// então uma mudança de perfil vale na hora. Sem sessão válida é 401; a checagem do perfil (403)
// vem depois, na PerfisPermitidos (que mora em shared, porque não depende de nada de contas).
export class SessaoDaRequisicao {
  readonly #deps: DependenciasDaSessao;

  constructor(deps: DependenciasDaSessao) {
    this.#deps = deps;
  }

  /** O token do cabeçalho "Authorization: Bearer <token>", ou null se o formato não for esse. */
  static extrairBearer(authorization: string | null): string | null {
    const encontrado = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
    return encontrado ? encontrado[1] : null;
  }

  async exigir(request: Request): Promise<SessaoAtiva> {
    const token = SessaoDaRequisicao.extrairBearer(request.headers.get("authorization"));
    const sessao = token ? this.#deps.tokens.verificar(token) : null;
    if (!sessao || !Uuid.ehValido(sessao.sub)) throw new UnauthorizedError(MENSAGEM);

    const usuario = await this.#deps.usuarios.buscarSituacaoPorId(sessao.sub);
    // um perfil fora da lista (banco num estado inesperado) não ganha acesso a nada
    if (!usuario || !usuario.ativo || !PERFIS.includes(usuario.perfil)) throw new UnauthorizedError(MENSAGEM);
    return { usuarioId: sessao.sub, perfil: usuario.perfil };
  }
}
