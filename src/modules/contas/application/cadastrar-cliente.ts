import { exigirDentroDoLimite } from "@/shared/db/limite-tentativas";
import { query } from "@/shared/db/pool";
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

// Cada cadastro gasta CPU e memória no hash da senha, então o limite por IP também protege
// o servidor, além de dificultar a criação de contas em massa.
const LIMITE_POR_IP = { max: 10, janelaSegundos: 60 * 60 };

export async function cadastrarCliente(
  entrada: unknown,
  contexto: { ip: string },
): Promise<ResultadoSessao> {
  await exigirDentroDoLimite(query, `cadastro:ip:${contexto.ip.slice(0, 64)}`, LIMITE_POR_IP);
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
