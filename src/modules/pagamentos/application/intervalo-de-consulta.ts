// Quantas vezes a rota 17 pode perguntar à Stripe sobre a mesma cobrança. A tela consulta o status
// a cada 3 segundos; o aviso da Stripe (rota 18) é o caminho principal da confirmação, e a consulta
// direta é só a rede de segurança (no ambiente local, por exemplo, o aviso não chega). Perguntar a
// cada poll multiplicaria as chamadas e esbarraria no limite de requisições da Stripe.
//
// Vale por processo (cada instância do servidor tem o seu), o que basta para o objetivo: diminuir
// as chamadas, não garantir um número exato.
export class IntervaloDeConsulta {
  readonly #intervaloMs: number;
  readonly #maximoDeChaves: number;
  readonly #ultimas = new Map<string, number>();

  constructor(intervaloMs: number, maximoDeChaves = 10_000) {
    if (!Number.isFinite(intervaloMs) || intervaloMs < 0) throw new RangeError("O intervalo precisa ser um número de ms >= 0.");
    if (!Number.isInteger(maximoDeChaves) || maximoDeChaves < 1) throw new RangeError("O máximo de chaves precisa ser >= 1.");
    this.#intervaloMs = intervaloMs;
    this.#maximoDeChaves = maximoDeChaves;
  }

  /** Diz se pode consultar a chave agora e, se pode, marca a consulta. */
  podeConsultar(chave: string, agora: Date): boolean {
    const instante = agora.getTime();
    const ultima = this.#ultimas.get(chave);
    if (ultima !== undefined && instante - ultima < this.#intervaloMs) return false;
    this.#ultimas.delete(chave);
    this.#ultimas.set(chave, instante);
    // o Map guarda a ordem de inserção: a mais antiga sai primeiro, e a memória não cresce sem fim
    if (this.#ultimas.size > this.#maximoDeChaves) {
      const maisAntiga = this.#ultimas.keys().next().value;
      if (maisAntiga !== undefined) this.#ultimas.delete(maisAntiga);
    }
    return true;
  }

  get tamanho(): number {
    return this.#ultimas.size;
  }
}
