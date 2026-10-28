import { createHash } from "node:crypto";
import { exigirDentroDoLimite, limparTentativas } from "@/shared/db/limite-tentativas";
import { query } from "@/shared/db/pool";
import { UnauthorizedError, ValidationError } from "@/shared/http/errors";
import { validarLogin } from "../domain/validacao";
import { hashParaTempoConstante, verificarSenha } from "../infrastructure/senha";
import { buscarPorEmail } from "../infrastructure/repositorio-usuarios";
import { montarSessao, type ResultadoSessao } from "./cadastrar-cliente";

// Contam toda tentativa de login, em três níveis:
// - por e-mail e IP: barra quem chuta a senha de uma conta a partir do mesmo lugar;
// - por IP: barra quem testa muitas contas;
// - por e-mail, com folga grande: freia um ataque vindo de muitos IPs sem deixar que um
//   estranho tranque a conta de outra pessoa (para isso ele precisaria de 100 tentativas).
// Um login certo zera a contagem de e-mail e IP.
const JANELA = 15 * 60;
const LIMITE_POR_IP = { max: 30, janelaSegundos: JANELA };
const LIMITE_POR_EMAIL_E_IP = { max: 10, janelaSegundos: JANELA };
const LIMITE_POR_EMAIL = { max: 100, janelaSegundos: JANELA };

export async function autenticar(
  entrada: unknown,
  contexto: { ip: string },
): Promise<ResultadoSessao> {
  const ip = contexto.ip.slice(0, 64);
  await exigirDentroDoLimite(query, `login:ip:${ip}`, LIMITE_POR_IP);

  const validado = validarLogin(entrada);
  if ("erros" in validado) {
    throw new ValidationError("Dados inválidos.", validado.erros);
  }
  const { email, senha } = validado.dados;
  // o e-mail vira hash para a tabela de limites não guardar endereços de e-mail
  const hashEmail = createHash("sha256").update(email).digest("hex").slice(0, 32);
  const chaveEmailEIp = `login:email-ip:${hashEmail}:${ip}`;
  await exigirDentroDoLimite(query, `login:email:${hashEmail}`, LIMITE_POR_EMAIL);
  await exigirDentroDoLimite(query, chaveEmailEIp, LIMITE_POR_EMAIL_E_IP);

  const usuario = await buscarPorEmail(email);
  // mesma mensagem e mesmo custo de tempo para e-mail inexistente, senha errada e conta inativa
  const hash = usuario?.senhaHash ?? (await hashParaTempoConstante());
  const senhaCorreta = await verificarSenha(senha, hash);
  if (!usuario || !senhaCorreta || !usuario.ativo) {
    throw new UnauthorizedError("E-mail ou senha inválidos.");
  }
  await limparTentativas(query, chaveEmailEIp);
  return montarSessao({
    id: usuario.id,
    perfil: usuario.perfil,
    nome: usuario.nome,
    email: usuario.email,
  });
}
