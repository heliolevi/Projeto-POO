import { UnauthorizedError } from "../../../shared/http/errors.ts";
import { PERFIS, type PerfilUsuario } from "../domain/usuario.ts";
import { verificarToken } from "../infrastructure/token.ts";

export type SessaoAtiva = { usuarioId: string; perfil: PerfilUsuario };

// Situação atual do usuário no banco, ou null se ele não existir mais.
export type BuscarSituacao = (
  usuarioId: string,
) => Promise<{ perfil: PerfilUsuario; ativo: boolean } | null>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MENSAGEM = "Sessão inválida ou expirada.";

export function extrairBearer(authorization: string | null): string | null {
  const encontrado = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
  return encontrado ? encontrado[1] : null;
}

// Usada pelas rotas que exigem login: `const sessao = await exigirSessao(request)`.
// Além de validar o token, confere no banco se a conta continua ativa, porque o token
// não pode ser revogado. O perfil devolvido é o do banco, não o que estava no token,
// então uma mudança de perfil vale na hora.
export function criarExigirSessao(buscarSituacao: BuscarSituacao) {
  return async function exigirSessao(request: Request): Promise<SessaoAtiva> {
    const token = extrairBearer(request.headers.get("authorization"));
    const sessao = token ? verificarToken(token) : null;
    if (!sessao || !UUID.test(sessao.sub)) throw new UnauthorizedError(MENSAGEM);

    const usuario = await buscarSituacao(sessao.sub);
    // um perfil fora da lista (banco num estado inesperado) não ganha acesso a nada
    if (!usuario || !usuario.ativo || !PERFIS.includes(usuario.perfil)) {
      throw new UnauthorizedError(MENSAGEM);
    }
    return { usuarioId: sessao.sub, perfil: usuario.perfil };
  };
}

// exigirPerfil (401 antes de 403) mora em shared, porque não depende de nada de contas e os módulos
// que a usam nas rotas precisam testar que a chamam. Reexportada aqui para o módulo e seus testes
// continuarem importando daqui.
export { exigirPerfil } from "../../../shared/http/perfil.ts";
