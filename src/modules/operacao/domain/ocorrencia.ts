import { ConflictError } from "../../../shared/http/errors.ts";
import { Dinheiro } from "../../../shared/dominio/dinheiro.ts";

// Mesmos valores dos enums do banco (tipo_ocorrencia, status_ocorrencia). ACIDENTE e OUTRO existem no
// banco, mas ainda não têm classe nem regra de cobrança (docs/orientacao-a-objetos.md).
export const TIPOS_DE_OCORRENCIA = ["DANO", "FURTO", "ATRASO", "ACIDENTE", "OUTRO"] as const;
export type TipoDeOcorrencia = (typeof TIPOS_DE_OCORRENCIA)[number];

export const STATUS_DE_OCORRENCIA = ["ABERTA", "EM_ANALISE", "RESOLVIDA", "CANCELADA"] as const;
export type StatusDeOcorrencia = (typeof STATUS_DE_OCORRENCIA)[number];

// 409: a ocorrência não está num estado que permita a operação pedida (ou o tipo não tem regra).
export class OcorrenciaInvalida extends ConflictError {}

// Quem pode ir para onde. RESOLVIDA e CANCELADA são finais.
const TRANSICOES: Record<StatusDeOcorrencia, readonly StatusDeOcorrencia[]> = {
  ABERTA: ["EM_ANALISE", "RESOLVIDA", "CANCELADA"],
  EM_ANALISE: ["RESOLVIDA", "CANCELADA"],
  RESOLVIDA: [],
  CANCELADA: [],
};

export type DadosBaseOcorrencia = {
  id: string;
  reservaId: string;
  bicicletaId: string;
  abertaPor: string;
  descricao: string;
  criadaEm: Date;
  // Só para reconstruir uma ocorrência que já existe no banco; uma nova nasce ABERTA, sem valor.
  status?: StatusDeOcorrencia;
  valorCobrado?: Dinheiro | null;
  resolvidaEm?: Date | null;
};

// Como a ocorrência sai da classe para a API.
export type OcorrenciaDto = {
  id: string;
  reservaId: string;
  bicicletaId: string;
  abertaPor: string;
  tipo: TipoDeOcorrencia;
  descricao: string;
  status: StatusDeOcorrencia;
  valorCobradoCentavos: number | null;
  criadaEm: string;
  resolvidaEm: string | null;
};

// Como o custo de uma ocorrência se divide: o que sai da caução e o que passa dela.
export type DivisaoDaCobranca = { daCaucao: Dinheiro; adicional: Dinheiro };

// Algo que aconteceu numa reserva e envolve uma bicicleta: dano, atraso ou furto. A classe abstrata
// guarda o que é comum (identidade, ciclo de vida, valor cobrado) e cada filha diz quanto cobrar.
//
// Encapsulamento: todo campo é privado; o status só muda por iniciarAnalise(), resolver() e cancelar(),
// que consultam a tabela TRANSICOES. O domínio não lê o relógio: quem chama passa `agora`.
// Polimorfismo: valorSugerido() é abstrato e cada tipo calcula do seu jeito.
export abstract class Ocorrencia {
  readonly #id: string;
  readonly #reservaId: string;
  readonly #bicicletaId: string;
  readonly #abertaPor: string;
  readonly #descricao: string;
  readonly #criadaEm: Date;
  #status: StatusDeOcorrencia;
  #valorCobrado: Dinheiro | null;
  #resolvidaEm: Date | null;

  protected constructor(dados: DadosBaseOcorrencia) {
    if (!dados.id) throw new RangeError("A ocorrência precisa de um id.");
    if (!dados.reservaId) throw new RangeError("A ocorrência precisa de uma reserva.");
    if (!dados.bicicletaId) throw new RangeError("A ocorrência precisa de uma bicicleta.");
    if (!dados.abertaPor) throw new RangeError("A ocorrência precisa de quem a abriu.");
    if (dados.descricao.trim().length === 0) throw new RangeError("Descreva a ocorrência.");
    if (Number.isNaN(dados.criadaEm.getTime())) throw new RangeError("Data de abertura inválida.");
    const status = dados.status ?? "ABERTA";
    if (!STATUS_DE_OCORRENCIA.includes(status)) throw new RangeError("Status de ocorrência inválido.");
    this.#id = dados.id;
    this.#reservaId = dados.reservaId;
    this.#bicicletaId = dados.bicicletaId;
    this.#abertaPor = dados.abertaPor;
    this.#descricao = dados.descricao.trim();
    this.#criadaEm = new Date(dados.criadaEm);
    this.#status = status;
    this.#valorCobrado = dados.valorCobrado ?? null;
    this.#resolvidaEm = dados.resolvidaEm ? new Date(dados.resolvidaEm) : null;
  }

  abstract get tipo(): TipoDeOcorrencia;
  // O valor que a regra do tipo indica cobrar. Quem resolve a ocorrência pode confirmar ou ajustar.
  abstract valorSugerido(): Dinheiro;

  get id(): string {
    return this.#id;
  }
  get reservaId(): string {
    return this.#reservaId;
  }
  get bicicletaId(): string {
    return this.#bicicletaId;
  }
  get abertaPor(): string {
    return this.#abertaPor;
  }
  get descricao(): string {
    return this.#descricao;
  }
  get status(): StatusDeOcorrencia {
    return this.#status;
  }
  get valorCobrado(): Dinheiro | null {
    return this.#valorCobrado;
  }
  get criadaEm(): Date {
    return new Date(this.#criadaEm);
  }
  get resolvidaEm(): Date | null {
    return this.#resolvidaEm === null ? null : new Date(this.#resolvidaEm);
  }

  // Ainda não terminou: pode ser analisada, resolvida ou cancelada.
  estaEmAberto(): boolean {
    return TRANSICOES[this.#status].length > 0;
  }

  iniciarAnalise(): void {
    this.#mudarPara("EM_ANALISE");
  }

  // Fecha a ocorrência com o valor realmente cobrado (zero, se nada será cobrado).
  resolver(valorCobrado: Dinheiro, agora: Date): void {
    this.#mudarPara("RESOLVIDA");
    this.#valorCobrado = valorCobrado;
    this.#resolvidaEm = new Date(agora);
  }

  cancelar(): void {
    this.#mudarPara("CANCELADA");
  }

  // O custo sai da caução e, se passar dela, o resto é cobrado do cliente (regra assumida em
  // docs/dados-da-locadora.md). Quem cria o Pagamento do adicional é o módulo de pagamentos.
  cobrarCliente(valor: Dinheiro, caucao: Dinheiro): DivisaoDaCobranca {
    const daCaucao = Dinheiro.menor(valor, caucao);
    return { daCaucao, adicional: valor.subtrair(daCaucao) };
  }

  paraDto(): OcorrenciaDto {
    return {
      id: this.#id,
      reservaId: this.#reservaId,
      bicicletaId: this.#bicicletaId,
      abertaPor: this.#abertaPor,
      tipo: this.tipo,
      descricao: this.#descricao,
      status: this.#status,
      valorCobradoCentavos: this.#valorCobrado === null ? null : this.#valorCobrado.centavos,
      criadaEm: this.#criadaEm.toISOString(),
      resolvidaEm: this.#resolvidaEm === null ? null : this.#resolvidaEm.toISOString(),
    };
  }

  toJSON(): OcorrenciaDto {
    return this.paraDto();
  }

  #mudarPara(novo: StatusDeOcorrencia): void {
    if (!TRANSICOES[this.#status].includes(novo)) {
      throw new OcorrenciaInvalida(`Não é possível passar a ocorrência de ${this.#status} para ${novo}.`);
    }
    this.#status = novo;
  }
}
