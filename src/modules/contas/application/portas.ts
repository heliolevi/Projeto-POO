import type { ContaLogada, PerfilCiclistaConta, PerfilUsuario, UsuarioComSenha, UsuarioPublico } from "../domain/usuario.ts";
import type { DadosCadastro, DadosPerfilCiclista } from "../domain/validador-de-conta.ts";

/** Quem está logado: o id e o perfil que o BANCO tem agora (não o do token). */
export type SessaoAtiva = { usuarioId: string; perfil: PerfilUsuario };

/** Situação atual do usuário no banco, ou null se ele não existir mais. */
export type SituacaoDoUsuario = { perfil: PerfilUsuario; ativo: boolean };

/**
 * Onde as contas ficam guardadas. Os casos de uso só falam com esta interface (o banco de verdade é o
 * RepositorioDeUsuarios), então os testes usam uma versão em memória.
 */
export interface ArmazemDeUsuarios {
  /** Cria um cliente. Lança EmailOuCpfJaCadastrado se o e-mail ou o CPF já existe. */
  criarCliente(dados: DadosCadastro, senhaHash: string, versaoTermos: string): Promise<UsuarioPublico>;
  buscarSituacaoPorId(id: string): Promise<SituacaoDoUsuario | null>;
  buscarSenhaHashPorId(id: string): Promise<string | null>;
  atualizarSenha(id: string, senhaHash: string): Promise<void>;
  desativar(id: string): Promise<void>;
  atualizarAltura(id: string, alturaCm: number): Promise<void>;
  registrarAceiteDeTermos(id: string, versao: string): Promise<void>;
  buscarPorEmail(email: string): Promise<UsuarioComSenha | null>;
  buscarConta(id: string): Promise<ContaLogada | null>;
  /** Grava os três dados do ciclista. Devolve null se a conta não for de um cliente. */
  gravarPerfilCiclista(id: string, dados: DadosPerfilCiclista): Promise<PerfilCiclistaConta | null>;
}

/** O que os casos de uso precisam de um gerador e conferidor de senha. */
export interface SenhasDaConta {
  gerarHash(senha: string): Promise<string>;
  verificar(senha: string, hash: string): Promise<boolean>;
  /** Um hash para gastar o mesmo tempo quando o e-mail não existe. */
  hashParaTempoConstante(): Promise<string>;
}

/** O que os casos de uso precisam do emissor e do verificador de token. */
export interface TokensDeSessao {
  emitir(usuario: { id: string; perfil: PerfilUsuario }): { token: string; expiraEm: Date };
  verificar(token: string): { sub: string } | null;
}

/** O limite de tentativas (a LimiteDeTentativas de verdade, ou uma de mentira nos testes). */
export interface ContadorDeTentativas {
  exigirDentroDoLimite(chave: string, regra: { max: number; janelaSegundos: number }): Promise<void>;
  limpar(chave: string): Promise<void>;
}
