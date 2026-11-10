import { criarExigirSessao } from "../application/exigir-sessao";
import { buscarSituacaoPorId } from "../infrastructure/repositorio-usuarios";

// A única instância, usada pelas rotas deste módulo e exportada no index.ts para as dos outros.
// Para rotas que exigem login (header Authorization: Bearer <token>). Lança 401 se o token
// for inválido ou expirado, ou se a conta tiver sido desativada.
export const exigirSessao = criarExigirSessao(buscarSituacaoPorId);
