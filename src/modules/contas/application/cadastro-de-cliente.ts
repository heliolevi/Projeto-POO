import { ConflictError, ValidationError } from "../../../shared/http/errors.ts";
import { VERSAO_TERMOS_ATUAL } from "../domain/usuario.ts";
import type { ValidadorDeConta } from "../domain/validador-de-conta.ts";
import { EmailOuCpfJaCadastrado } from "../infrastructure/repositorio-usuarios.ts";
import type { EmissorDeSessao, ResultadoSessao } from "./emissor-de-sessao.ts";
import type { ArmazemDeUsuarios, ContadorDeTentativas, SenhasDaConta } from "./portas.ts";

// Cada cadastro gasta CPU e memória no hash da senha, então o limite por IP também protege
// o servidor, além de dificultar a criação de contas em massa.
const LIMITE_POR_IP = { max: 10, janelaSegundos: 60 * 60 };

export type DependenciasDoCadastro = {
  limite: ContadorDeTentativas;
  validador: Pick<ValidadorDeConta, "cadastro">;
  senhas: Pick<SenhasDaConta, "gerarHash">;
  usuarios: Pick<ArmazemDeUsuarios, "criarCliente">;
  sessoes: Pick<EmissorDeSessao, "emitir">;
};

// POST /api/auth/cadastro (rota 1): cria a conta de um cliente e já devolve a sessão. O limite por IP
// vem antes de qualquer outra coisa (inclusive da validação), e e-mail ou CPF repetido vira 409.
export class CadastroDeCliente {
  readonly #deps: DependenciasDoCadastro;

  constructor(deps: DependenciasDoCadastro) {
    this.#deps = deps;
  }

  async cadastrar(entrada: unknown, contexto: { ip: string }): Promise<ResultadoSessao> {
    await this.#deps.limite.exigirDentroDoLimite(`cadastro:ip:${contexto.ip.slice(0, 64)}`, LIMITE_POR_IP);
    const validado = this.#deps.validador.cadastro(entrada);
    if ("erros" in validado) throw new ValidationError("Dados inválidos.", validado.erros);

    const senhaHash = await this.#deps.senhas.gerarHash(validado.dados.senha);
    try {
      const usuario = await this.#deps.usuarios.criarCliente(validado.dados, senhaHash, VERSAO_TERMOS_ATUAL);
      return this.#deps.sessoes.emitir(usuario);
    } catch (erro) {
      if (erro instanceof EmailOuCpfJaCadastrado) throw new ConflictError("E-mail ou CPF já cadastrado.");
      throw erro;
    }
  }
}
