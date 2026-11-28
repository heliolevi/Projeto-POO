import { SessaoDaRequisicao } from "../application/sessao-da-requisicao";
import { RepositorioDeUsuarios } from "../infrastructure/repositorio-usuarios";
import { ServicoDeToken } from "../infrastructure/token";

// A única instância, usada pelas rotas deste módulo e exportada no index.ts para as dos outros.
// Para rotas que exigem login (header Authorization: Bearer <token>): `sessoes.exigir(request)` lança
// 401 se o token for inválido ou expirado, ou se a conta tiver sido desativada.
export const sessoes = new SessaoDaRequisicao({
  tokens: ServicoDeToken.padrao,
  usuarios: RepositorioDeUsuarios.padrao,
});
