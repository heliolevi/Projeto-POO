import { GradeDeHorarios } from "./grade-de-horarios";
import { LeitorDeObjeto } from "./leitor-de-objeto";

export type DadosDoPonto = {
  id: string;
  nome: string;
  logradouro?: string;
  numero?: string;
  complemento?: string | null;
  bairro?: string;
  cep?: string;
  cidade?: string;
  uf?: string;
  telefone?: string | null;
  horarios?: GradeDeHorarios;
};

/** Como o ponto sai da API (contrato, rota 9). */
export type PontoDto = {
  id: string;
  nome: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cep: string;
  cidade: string;
  uf: string;
  telefone: string | null;
  horarios: { diaSemana: number; abre: string; fecha: string }[];
};

/** O que o seletor de ponto do painel do admin precisa. */
export type OpcaoDePonto = { id: string; nome: string };

// O ponto de retirada e devolução, como a tela o enxerga. Só existe com id e nome; o resto do
// endereço que faltar fica vazio. Os campos são privados e o objeto não muda depois de criado.
export class PontoDeRetirada {
  readonly #id: string;
  readonly #nome: string;
  readonly #logradouro: string;
  readonly #numero: string;
  readonly #complemento: string | null;
  readonly #bairro: string;
  readonly #cep: string;
  readonly #cidade: string;
  readonly #uf: string;
  readonly #telefone: string | null;
  readonly #horarios: GradeDeHorarios;

  constructor(dados: DadosDoPonto) {
    if (dados.id.trim() === "") throw new RangeError("O ponto precisa de um id.");
    if (dados.nome.trim() === "") throw new RangeError("O ponto precisa de um nome.");
    this.#id = dados.id.trim();
    this.#nome = dados.nome.trim();
    this.#logradouro = (dados.logradouro ?? "").trim();
    this.#numero = (dados.numero ?? "").trim();
    this.#complemento = dados.complemento?.trim() || null;
    this.#bairro = (dados.bairro ?? "").trim();
    this.#cep = (dados.cep ?? "").trim();
    this.#cidade = (dados.cidade ?? "").trim();
    this.#uf = (dados.uf ?? "").trim();
    this.#telefone = dados.telefone?.trim() || null;
    this.#horarios = dados.horarios ?? new GradeDeHorarios([]);
  }

  /** Lê um item de `pontos` da resposta da API. Devolve null se o item não for um ponto utilizável. */
  static deResposta(bruto: unknown): PontoDeRetirada | null {
    const leitor = LeitorDeObjeto.de(bruto);
    if (!leitor) return null;
    const id = leitor.texto("id");
    const nome = leitor.texto("nome");
    if (id === "" || nome === "") return null;
    return new PontoDeRetirada({
      id,
      nome,
      logradouro: leitor.texto("logradouro"),
      numero: leitor.texto("numero"),
      complemento: leitor.textoOuNulo("complemento"),
      bairro: leitor.texto("bairro"),
      cep: leitor.texto("cep"),
      cidade: leitor.texto("cidade"),
      uf: leitor.texto("uf"),
      telefone: leitor.textoOuNulo("telefone"),
      horarios: GradeDeHorarios.doPonto(leitor),
    });
  }

  get id(): string {
    return this.#id;
  }

  get nome(): string {
    return this.#nome;
  }

  get telefone(): string | null {
    return this.#telefone;
  }

  get horarios(): GradeDeHorarios {
    return this.#horarios;
  }

  /** "Av. Litorânea, 100 (loja 2), Calhau, São Luís/MA", sem vírgula sobrando se faltar parte. */
  endereco(): string {
    const rua = [this.#logradouro, this.#numero].filter(Boolean).join(", ");
    const comComplemento = this.#complemento ? (rua ? `${rua} (${this.#complemento})` : this.#complemento) : rua;
    const cidade = [this.#cidade, this.#uf].filter(Boolean).join("/");
    return [comComplemento, this.#bairro, cidade].filter(Boolean).join(", ");
  }

  opcao(): OpcaoDePonto {
    return { id: this.#id, nome: this.#nome };
  }

  paraDto(): PontoDto {
    return {
      id: this.#id,
      nome: this.#nome,
      logradouro: this.#logradouro,
      numero: this.#numero,
      complemento: this.#complemento,
      bairro: this.#bairro,
      cep: this.#cep,
      cidade: this.#cidade,
      uf: this.#uf,
      telefone: this.#telefone,
      horarios: this.#horarios.paraDto(),
    };
  }

  toJSON(): PontoDto {
    return this.paraDto();
  }
}
