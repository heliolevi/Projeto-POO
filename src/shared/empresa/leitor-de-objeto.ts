// Embrulha um valor que veio da rede (tipo desconhecido) e só deixa ler campo por campo, já no tipo
// certo. Ler um campo que não existe ou veio de outro tipo nunca lança: devolve o valor neutro
// ("" , null ou lista vazia). Só conta campo próprio do objeto, então "constructor" ou "__proto__"
// vindos num JSON não enganam a leitura.
export class LeitorDeObjeto {
  readonly #dados: Readonly<Record<string, unknown>>;

  private constructor(dados: Readonly<Record<string, unknown>>) {
    this.#dados = dados;
  }

  /** Devolve null se o valor não for um objeto simples (nulo, lista, texto, número...). */
  static de(valor: unknown): LeitorDeObjeto | null {
    if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return null;
    return new LeitorDeObjeto(valor as Record<string, unknown>);
  }

  /** O valor do campo como veio, ou undefined se o objeto não tem esse campo. */
  bruto(chave: string): unknown {
    return Object.hasOwn(this.#dados, chave) ? this.#dados[chave] : undefined;
  }

  /** Texto sem as pontas em branco, ou "" se o campo não for texto. */
  texto(chave: string): string {
    const valor = this.bruto(chave);
    return typeof valor === "string" ? valor.trim() : "";
  }

  /** Texto sem as pontas em branco, ou null se não for texto ou ficar vazio. */
  textoOuNulo(chave: string): string | null {
    const limpo = this.texto(chave);
    return limpo === "" ? null : limpo;
  }

  /** Os itens do campo, ou lista vazia se o campo não for uma lista. */
  lista(chave: string): readonly unknown[] {
    const valor = this.bruto(chave);
    return Array.isArray(valor) ? valor : [];
  }

  /** O campo como outro leitor, ou null se não for um objeto simples. */
  objeto(chave: string): LeitorDeObjeto | null {
    return LeitorDeObjeto.de(this.bruto(chave));
  }
}
