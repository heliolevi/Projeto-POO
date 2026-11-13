import { Usuario, type DadosUsuario, type Permissao } from "./usuario-base.ts";
import type { PerfilUsuario } from "./usuario.ts";

export const PERMISSOES_DO_OPERADOR: readonly Permissao[] = [
  "reserva:ver-todas",
  "operacao:registrar-retirada",
  "operacao:registrar-devolucao",
  "ocorrencia:abrir",
];

export type DadosOperador = DadosUsuario & {
  // ponto em que o operador atua; null quando atua em qualquer ponto
  pontoId?: string | null;
};

// Quem atende no balcão: registra retirada e devolução e abre ocorrências.
export class Operador extends Usuario {
  readonly #pontoId: string | null;

  constructor(dados: DadosOperador) {
    super(dados);
    this.#pontoId = dados.pontoId ?? null;
  }

  get perfil(): PerfilUsuario {
    return "OPERADOR";
  }

  get pontoId(): string | null {
    return this.#pontoId;
  }

  permissoes(): readonly Permissao[] {
    return PERMISSOES_DO_OPERADOR;
  }

  podeAtuarNoPonto(pontoId: string): boolean {
    return this.#pontoId === null || this.#pontoId === pontoId;
  }
}
