// Identificador UUID, o formato de todos os ids do sistema (colunas uuid do banco). Serve para recusar,
// logo na entrada, um id que nem pode existir (404 sem gastar uma consulta) e para nunca mandar ao banco
// um texto que não seja UUID. Só tem método estático: não se cria instância.
export class Uuid {
  static readonly #FORMATO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  private constructor() {
    throw new TypeError("Uuid só tem método estático; não se cria instância.");
  }

  /** Verdadeiro para um texto no formato UUID (qualquer caixa). Qualquer outro valor é falso. */
  static ehValido(valor: unknown): valor is string {
    return typeof valor === "string" && Uuid.#FORMATO.test(valor);
  }
}
