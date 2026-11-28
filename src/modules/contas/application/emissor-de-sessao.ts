import type { UsuarioPublico } from "../domain/usuario.ts";
import type { TokensDeSessao } from "./portas.ts";

/** O que o cadastro e o login devolvem (contrato, rotas 1 e 2). */
export type ResultadoSessao = {
  token: string;
  tipo: "Bearer";
  expiraEm: string;
  usuario: UsuarioPublico;
};

// Monta a resposta de sessão: o token assinado, o tipo, quando expira e o usuário público.
export class EmissorDeSessao {
  readonly #tokens: Pick<TokensDeSessao, "emitir">;

  constructor(tokens: Pick<TokensDeSessao, "emitir">) {
    this.#tokens = tokens;
  }

  emitir(usuario: UsuarioPublico): ResultadoSessao {
    const { token, expiraEm } = this.#tokens.emitir(usuario);
    return { token, tipo: "Bearer", expiraEm: expiraEm.toISOString(), usuario };
  }
}
