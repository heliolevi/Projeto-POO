import { ConflictError, ValidationError } from "@/shared/http/errors";
import { validarCadastro } from "../domain/validacao";
import { VERSAO_TERMOS_ATUAL, type UsuarioPublico } from "../domain/usuario";
import { gerarHashSenha } from "../infrastructure/senha";
import { criarCliente, EmailOuCpfJaCadastrado } from "../infrastructure/repositorio-usuarios";
import { emitirToken } from "../infrastructure/token";

export type ResultadoSessao = {
  token: string;
  tipo: "Bearer";
  expiraEm: string;
  usuario: UsuarioPublico;
};

export function montarSessao(usuario: UsuarioPublico): ResultadoSessao {
  const { token, expiraEm } = emitirToken(usuario);
  return { token, tipo: "Bearer", expiraEm: expiraEm.toISOString(), usuario };
}

export async function cadastrarCliente(entrada: unknown): Promise<ResultadoSessao> {
  const validado = validarCadastro(entrada);
  if ("erros" in validado) {
    throw new ValidationError("Dados inválidos.", validado.erros);
  }
  const senhaHash = await gerarHashSenha(validado.dados.senha);
  try {
    const usuario = await criarCliente(validado.dados, senhaHash, VERSAO_TERMOS_ATUAL);
    return montarSessao(usuario);
  } catch (erro) {
    if (erro instanceof EmailOuCpfJaCadastrado) {
      throw new ConflictError("E-mail ou CPF já cadastrado.");
    }
    throw erro;
  }
}
