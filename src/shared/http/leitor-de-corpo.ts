import { PayloadTooLargeError, ValidationError } from "./errors.ts";

// Lê o corpo de uma requisição com um limite de bytes. Corpos de formulário e de cadastro são
// pequenos; passar do limite é abuso (413) e JSON quebrado é 400. O limite é escolhido no
// construtor, então cada rota pode ter o seu.
export class LeitorDeCorpo {
  static readonly LIMITE_PADRAO_BYTES = 16 * 1024;

  readonly #maxBytes: number;

  constructor(maxBytes: number = LeitorDeCorpo.LIMITE_PADRAO_BYTES) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
      throw new RangeError("O limite do corpo precisa ser um inteiro positivo, em bytes.");
    }
    this.#maxBytes = maxBytes;
  }

  get maxBytes(): number {
    return this.#maxBytes;
  }

  // Lê o corpo como texto, recusando o que passar do limite. A leitura para assim que o limite
  // estoura, sem carregar o corpo inteiro na memória.
  async lerTexto(request: Request): Promise<string> {
    const declarado = Number(request.headers.get("content-length"));
    if (Number.isFinite(declarado) && declarado > this.#maxBytes) throw new PayloadTooLargeError();
    if (!request.body) return "";

    const leitor = request.body.getReader();
    const pedacos: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > this.#maxBytes) {
        await leitor.cancel();
        throw new PayloadTooLargeError();
      }
      pedacos.push(value);
    }

    const inteiro = new Uint8Array(total);
    let posicao = 0;
    for (const pedaco of pedacos) {
      inteiro.set(pedaco, posicao);
      posicao += pedaco.byteLength;
    }
    return new TextDecoder().decode(inteiro);
  }

  // Lê o corpo como JSON. Corpo grande demais é 413 e JSON quebrado (ou vazio) é 400.
  async lerJson(request: Request): Promise<unknown> {
    const texto = await this.lerTexto(request);
    try {
      return JSON.parse(texto);
    } catch {
      throw new ValidationError("O corpo da requisição precisa ser um JSON válido.");
    }
  }
}
