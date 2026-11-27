import type { LimiteDeTentativas } from "../../../shared/db/limite-tentativas.ts";
import { UnauthorizedError, ValidationError } from "../../../shared/http/errors.ts";
import { validarAlterarSenha } from "../domain/validacao.ts";

export type DependenciasAlterarSenha = {
  // o limite de tentativas por usuário (guardado na tabela limite_tentativas)
  limite: LimiteDeTentativas;
  buscarSenhaHash: (usuarioId: string) => Promise<string | null>;
  salvarSenhaHash: (usuarioId: string, senhaHash: string) => Promise<void>;
  verificarSenha: (senha: string, hash: string) => Promise<boolean>;
  gerarHashSenha: (senha: string) => Promise<string>;
};

// Com um token roubado, a troca de senha serviria para adivinhar a senha atual sem passar
// pelo limite do login. Por isso cada usuário tem a sua cota de tentativas; acertar zera.
export const LIMITE_TROCA_SENHA = { max: 10, janelaSegundos: 15 * 60 };

export function criarAlterarSenha(deps: DependenciasAlterarSenha) {
  return async function alterarSenha(usuarioId: string, entrada: unknown): Promise<void> {
    const validado = validarAlterarSenha(entrada);
    if ("erros" in validado) throw new ValidationError("Dados inválidos.", validado.erros);
    const { senhaAtual, novaSenha } = validado.dados;

    const chave = `senha:usuario:${usuarioId}`;
    await deps.limite.exigirDentroDoLimite(chave, LIMITE_TROCA_SENHA);

    const hashAtual = await deps.buscarSenhaHash(usuarioId);
    if (!hashAtual || !(await deps.verificarSenha(senhaAtual, hashAtual))) {
      throw new UnauthorizedError("Senha atual incorreta.");
    }
    await deps.limite.limpar(chave);
    await deps.salvarSenhaHash(usuarioId, await deps.gerarHashSenha(novaSenha));
  };
}
