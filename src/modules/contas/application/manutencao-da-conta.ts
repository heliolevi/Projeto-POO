import { UnauthorizedError, ValidationError } from "../../../shared/http/errors.ts";
import { VERSAO_TERMOS_ATUAL } from "../domain/usuario.ts";
import type { ValidadorDeConta } from "../domain/validador-de-conta.ts";
import type { ArmazemDeUsuarios, ContadorDeTentativas, SenhasDaConta } from "./portas.ts";

// Com um token roubado, a troca de senha serviria para adivinhar a senha atual sem passar
// pelo limite do login. Por isso cada usuário tem a sua cota de tentativas; acertar zera.
export const LIMITE_TROCA_SENHA = { max: 10, janelaSegundos: 15 * 60 };

export type DependenciasDaManutencao = {
  limite: ContadorDeTentativas;
  validador: Pick<ValidadorDeConta, "alterarSenha" | "altura" | "aceiteDeTermos">;
  senhas: Pick<SenhasDaConta, "gerarHash" | "verificar">;
  usuarios: Pick<
    ArmazemDeUsuarios,
    "buscarSenhaHashPorId" | "atualizarSenha" | "atualizarAltura" | "registrarAceiteDeTermos" | "desativar"
  >;
};

// O que o próprio usuário faz na conta: trocar a senha, mudar a altura, aceitar os termos e desativar.
// O alvo é sempre a conta do token (o id vem da sessão, nunca do corpo).
export class ManutencaoDaConta {
  readonly #deps: DependenciasDaManutencao;

  constructor(deps: DependenciasDaManutencao) {
    this.#deps = deps;
  }

  /** POST /api/conta/senha (rota 5). Senha atual errada é 401, e as tentativas têm limite por usuário. */
  async alterarSenha(usuarioId: string, entrada: unknown): Promise<void> {
    const validado = this.#deps.validador.alterarSenha(entrada);
    if ("erros" in validado) throw new ValidationError("Dados inválidos.", validado.erros);
    const { senhaAtual, novaSenha } = validado.dados;

    const chave = `senha:usuario:${usuarioId}`;
    await this.#deps.limite.exigirDentroDoLimite(chave, LIMITE_TROCA_SENHA);

    const hashAtual = await this.#deps.usuarios.buscarSenhaHashPorId(usuarioId);
    if (!hashAtual || !(await this.#deps.senhas.verificar(senhaAtual, hashAtual))) {
      throw new UnauthorizedError("Senha atual incorreta.");
    }
    await this.#deps.limite.limpar(chave);
    await this.#deps.usuarios.atualizarSenha(usuarioId, await this.#deps.senhas.gerarHash(novaSenha));
  }

  /** POST /api/conta/altura (rota 6). */
  async atualizarAltura(usuarioId: string, entrada: unknown): Promise<void> {
    const validado = this.#deps.validador.altura(entrada);
    if ("erros" in validado) throw new ValidationError("Dados inválidos.", validado.erros);
    await this.#deps.usuarios.atualizarAltura(usuarioId, validado.dados);
  }

  /** POST /api/conta/termos (rota 7): só a versão vigente pode ser aceita. */
  async aceitarTermos(usuarioId: string, entrada: unknown): Promise<void> {
    const validado = this.#deps.validador.aceiteDeTermos(entrada, VERSAO_TERMOS_ATUAL);
    if ("erros" in validado) throw new ValidationError("Dados inválidos.", validado.erros);
    await this.#deps.usuarios.registrarAceiteDeTermos(usuarioId, validado.dados);
  }

  /** POST /api/conta/desativar (rota 8): marca a conta como inativa (não apaga). */
  async desativar(usuarioId: string): Promise<void> {
    await this.#deps.usuarios.desativar(usuarioId);
  }
}
