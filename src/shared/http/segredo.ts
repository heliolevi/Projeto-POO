import { timingSafeEqual } from "node:crypto";

// Protege uma rota com um segredo no cabeçalho "Authorization: Bearer <segredo>". A conferência é
// em tempo constante. Segredo ausente ou curto demais deixa a rota desligada: nada passa.
export class SegredoBearer {
  // Segredos curtos são fáceis de adivinhar.
  static readonly TAMANHO_MINIMO = 16;

  readonly #esperado: string | undefined;

  constructor(esperado: string | undefined) {
    this.#esperado = esperado;
  }

  /** Falso se o segredo não está configurado ou é curto demais (a rota fica desligada). */
  get ativo(): boolean {
    return Boolean(this.#esperado) && (this.#esperado as string).length >= SegredoBearer.TAMANHO_MINIMO;
  }

  confere(authorization: string | null): boolean {
    if (!this.ativo) return false;
    const encontrado = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
    if (!encontrado) return false;
    const recebido = Buffer.from(encontrado[1]);
    const certo = Buffer.from(this.#esperado as string);
    return recebido.length === certo.length && timingSafeEqual(recebido, certo);
  }
}
