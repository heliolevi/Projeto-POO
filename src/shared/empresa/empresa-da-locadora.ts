import { LeitorDeObjeto } from "./leitor-de-objeto";
import { PontoDeRetirada, type PontoDto } from "./ponto-de-retirada";

export type DadosDaEmpresa = {
  nomeFantasia: string;
  telefone?: string | null;
  email?: string;
  pontos?: readonly PontoDeRetirada[];
};

/** Como a locadora sai da API (contrato, rota 9). */
export type EmpresaDto = {
  nomeFantasia: string;
  telefone: string | null;
  email: string;
  pontos: PontoDto[];
};

// A locadora como a tela a enxerga: nome, contato e os pontos de retirada ativos. Só existe com
// nome fantasia. Os campos são privados; quem pede os pontos recebe uma cópia da lista.
export class EmpresaDaLocadora {
  readonly #nomeFantasia: string;
  readonly #telefone: string | null;
  readonly #email: string;
  readonly #pontos: readonly PontoDeRetirada[];

  constructor(dados: DadosDaEmpresa) {
    if (dados.nomeFantasia.trim() === "") throw new RangeError("A locadora precisa de um nome fantasia.");
    this.#nomeFantasia = dados.nomeFantasia.trim();
    this.#telefone = dados.telefone?.trim() || null;
    this.#email = (dados.email ?? "").trim();
    this.#pontos = [...(dados.pontos ?? [])];
  }

  /**
   * Lê o corpo de GET /api/empresa (`{ data: {...} }`). Devolve null quando não dá para confiar no
   * corpo: não é o formato esperado ou falta o nome da locadora. Ponto inválido é descartado
   * sozinho, e `pontos` ausente vira lista vazia. Só os campos do contrato são lidos.
   */
  static deResposta(corpo: unknown): EmpresaDaLocadora | null {
    const dados = LeitorDeObjeto.de(corpo)?.objeto("data");
    if (!dados) return null;
    const nomeFantasia = dados.texto("nomeFantasia");
    if (nomeFantasia === "") return null;
    const pontos: PontoDeRetirada[] = [];
    for (const item of dados.lista("pontos")) {
      const ponto = PontoDeRetirada.deResposta(item);
      if (ponto) pontos.push(ponto);
    }
    return new EmpresaDaLocadora({
      nomeFantasia,
      telefone: dados.textoOuNulo("telefone"),
      email: dados.texto("email"),
      pontos,
    });
  }

  get nomeFantasia(): string {
    return this.#nomeFantasia;
  }

  get telefone(): string | null {
    return this.#telefone;
  }

  get email(): string {
    return this.#email;
  }

  get pontos(): PontoDeRetirada[] {
    return [...this.#pontos];
  }

  /** O ponto que a tela mostra: o primeiro (a locadora tem um só no MVP). Null se não houver. */
  pontoPrincipal(): PontoDeRetirada | null {
    return this.#pontos[0] ?? null;
  }

  /** O telefone do próprio ponto, ou o da locadora se o ponto não tiver. */
  telefoneDoPonto(ponto: PontoDeRetirada): string | null {
    return ponto.telefone ?? this.#telefone;
  }

  paraDto(): EmpresaDto {
    return {
      nomeFantasia: this.#nomeFantasia,
      telefone: this.#telefone,
      email: this.#email,
      pontos: this.#pontos.map((ponto) => ponto.paraDto()),
    };
  }

  toJSON(): EmpresaDto {
    return this.paraDto();
  }
}
