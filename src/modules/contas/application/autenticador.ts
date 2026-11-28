import { createHash } from "node:crypto";
import { UnauthorizedError, ValidationError } from "../../../shared/http/errors.ts";
import { FabricaDeUsuario } from "../domain/fabrica-usuario.ts";
import type { ValidadorDeConta } from "../domain/validador-de-conta.ts";
import type { EmissorDeSessao, ResultadoSessao } from "./emissor-de-sessao.ts";
import type { ArmazemDeUsuarios, ContadorDeTentativas, SenhasDaConta } from "./portas.ts";

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

export type DependenciasDoAutenticador = {
  limite: ContadorDeTentativas;
  validador: Pick<ValidadorDeConta, "login">;
  senhas: SenhasDaConta;
  usuarios: Pick<ArmazemDeUsuarios, "buscarPorEmail">;
  sessoes: Pick<EmissorDeSessao, "emitir">;
};

// POST /api/auth/login (rota 2). A mensagem e o custo de tempo são os mesmos para e-mail inexistente,
// senha errada e conta inativa: sem usuário, roda o scrypt inteiro contra um hash falso; com usuário,
// Usuario.autenticar também confere a senha antes de olhar se a conta está ativa.
export class Autenticador {
  readonly #deps: DependenciasDoAutenticador;

  constructor(deps: DependenciasDoAutenticador) {
    this.#deps = deps;
  }

  async autenticar(entrada: unknown, contexto: { ip: string }): Promise<ResultadoSessao> {
    const { limite, senhas } = this.#deps;
    const ip = contexto.ip.slice(0, 64);
    await limite.exigirDentroDoLimite(`login:ip:${ip}`, LIMITE_POR_IP);

    const validado = this.#deps.validador.login(entrada);
    if ("erros" in validado) throw new ValidationError("Dados inválidos.", validado.erros);
    const { email, senha } = validado.dados;

    // o e-mail vira hash para a tabela de limites não guardar endereços de e-mail
    const hashEmail = createHash("sha256").update(email).digest("hex").slice(0, 32);
    const chaveEmailEIp = `login:email-ip:${hashEmail}:${ip}`;
    await limite.exigirDentroDoLimite(`login:email:${hashEmail}`, LIMITE_POR_EMAIL);
    await limite.exigirDentroDoLimite(chaveEmailEIp, LIMITE_POR_EMAIL_E_IP);

    const linha = await this.#deps.usuarios.buscarPorEmail(email);
    if (!linha) {
      await senhas.verificar(senha, await senhas.hashParaTempoConstante());
      throw new UnauthorizedError("E-mail ou senha inválidos.");
    }
    const usuario = FabricaDeUsuario.criar(linha);
    if (!(await usuario.autenticar(senha, senhas))) {
      throw new UnauthorizedError("E-mail ou senha inválidos.");
    }
    await limite.limpar(chaveEmailEIp);
    return this.#deps.sessoes.emitir(usuario.paraPublico());
  }
}
