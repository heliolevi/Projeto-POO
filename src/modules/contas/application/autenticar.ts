import { UnauthorizedError, ValidationError } from "@/shared/http/errors";
import { validarLogin } from "../domain/validacao";
import { hashParaTempoConstante, verificarSenha } from "../infrastructure/senha";
import { buscarPorEmail } from "../infrastructure/repositorio-usuarios";
import { montarSessao, type ResultadoSessao } from "./cadastrar-cliente";

export async function autenticar(entrada: unknown): Promise<ResultadoSessao> {
  const validado = validarLogin(entrada);
  if ("erros" in validado) {
    throw new ValidationError("Dados inválidos.", validado.erros);
  }
  const { email, senha } = validado.dados;
  const usuario = await buscarPorEmail(email);
  // mesma mensagem e mesmo custo de tempo para e-mail inexistente, senha errada e conta inativa
  const hash = usuario?.senhaHash ?? (await hashParaTempoConstante());
  const senhaCorreta = await verificarSenha(senha, hash);
  if (!usuario || !senhaCorreta || !usuario.ativo) {
    throw new UnauthorizedError("E-mail ou senha inválidos.");
  }
  return montarSessao({
    id: usuario.id,
    perfil: usuario.perfil,
    nome: usuario.nome,
    email: usuario.email,
  });
}
