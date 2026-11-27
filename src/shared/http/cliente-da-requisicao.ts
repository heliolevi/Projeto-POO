// Quem fez a requisição. Na Vercel, x-vercel-forwarded-for é definido pela própria plataforma e
// não pode ser forjado pelo cliente; os outros cabeçalhos são só o plano B.
export class ClienteDaRequisicao {
  readonly #headers: Headers;

  constructor(headers: Headers) {
    this.#headers = headers;
  }

  /** O IP de quem chamou, ou "desconhecido" se nenhum cabeçalho o trouxer. */
  get ip(): string {
    const vercel = this.#headers.get("x-vercel-forwarded-for");
    if (vercel) return vercel.split(",")[0].trim();
    const encaminhado = this.#headers.get("x-forwarded-for");
    if (encaminhado) return encaminhado.split(",")[0].trim();
    return this.#headers.get("x-real-ip")?.trim() || "desconhecido";
  }
}
