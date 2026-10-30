import { UnauthorizedError, ValidationError } from "@/shared/http/errors";
import { validarAlterarSenha } from "../domain/validacao";
import { gerarHashSenha, verificarSenha } from "../infrastructure/senha";
import { atualizarSenha, buscarSenhaHashPorId } from "../infrastructure/repositorio-usuarios";

export async function alterarSenha(usuarioId: string, entrada: unknown): Promise<void> {
  const validado = validarAlterarSenha(entrada);
  if ("erros" in validado) throw new ValidationError("Dados inválidos.", validado.erros);

  const hashAtual = await buscarSenhaHashPorId(usuarioId);
  if (!hashAtual || !(await verificarSenha(validado.dados.senhaAtual, hashAtual))) {
    throw new UnauthorizedError("Senha atual incorreta.");
  }

  const novoHash = await gerarHashSenha(validado.dados.novaSenha);
  await atualizarSenha(usuarioId, novoHash);
}
