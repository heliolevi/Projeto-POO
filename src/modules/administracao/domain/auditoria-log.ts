// Mesmos valores do enum acao_auditoria do banco.
export const ACOES_DE_AUDITORIA = ["CRIACAO", "ATUALIZACAO", "EXCLUSAO"] as const;
export type AcaoDeAuditoria = (typeof ACOES_DE_AUDITORIA)[number];

// Dados guardados antes e depois de uma alteração (o jsonb do banco).
export type Dados = Record<string, unknown>;

export type DadosParaRegistrar = {
  entidade: string;
  entidadeId: string;
  acao: AcaoDeAuditoria;
  dadosAntes?: Dados | null;
  dadosDepois?: Dados | null;
  usuarioId?: string | null;
  ip?: string | null;
};

export type Diferenca = { campo: string; antes: unknown; depois: unknown };

export type FiltroDeAuditoria = {
  entidade?: string;
  entidadeId?: string;
  usuarioId?: string;
  acao?: AcaoDeAuditoria;
  desde?: Date;
  ate?: Date;
};

// A trilha nunca guarda segredo: estes campos viram "[REDIGIDO]" em qualquer nível do objeto.
const CAMPOS_SENSIVEIS = new Set(["senha", "senhahash", "senha_hash", "token", "novasenha", "senhaatual"]);
export const REDIGIDO = "[REDIGIDO]";

function limpar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(limpar);
  if (valor instanceof Date) return valor.toISOString();
  if (valor !== null && typeof valor === "object") {
    const saida: Dados = {};
    for (const [chave, v] of Object.entries(valor as Dados)) {
      saida[chave] = CAMPOS_SENSIVEIS.has(chave.toLowerCase()) ? REDIGIDO : limpar(v);
    }
    return saida;
  }
  if (typeof valor === "function" || typeof valor === "symbol" || typeof valor === "bigint") {
    throw new RangeError("Os dados da auditoria precisam ser JSON (sem funções, símbolos ou bigint).");
  }
  return valor;
}

function congelar<T>(valor: T): T {
  if (valor !== null && typeof valor === "object") {
    for (const v of Object.values(valor as object)) congelar(v);
    Object.freeze(valor);
  }
  return valor;
}

// Um registro da trilha de auditoria: quem alterou o quê, com os dados antes e depois. Serve para
// reservas, estoque e valores.
//
// Encapsulamento: o registro é imutável. Os dados são copiados e congelados na criação (quem mexer
// no objeto original depois não altera a trilha) e não há nenhum método que os modifique.
export class AuditoriaLog {
  readonly #entidade: string;
  readonly #entidadeId: string;
  readonly #acao: AcaoDeAuditoria;
  readonly #dadosAntes: Dados | null;
  readonly #dadosDepois: Dados | null;
  readonly #usuarioId: string | null;
  readonly #ip: string | null;
  readonly #criadoEm: Date;

  private constructor(dados: DadosParaRegistrar, criadoEm: Date) {
    this.#entidade = dados.entidade;
    this.#entidadeId = dados.entidadeId;
    this.#acao = dados.acao;
    this.#dadosAntes = dados.dadosAntes ? congelar(limpar(dados.dadosAntes) as Dados) : null;
    this.#dadosDepois = dados.dadosDepois ? congelar(limpar(dados.dadosDepois) as Dados) : null;
    this.#usuarioId = dados.usuarioId ?? null;
    this.#ip = dados.ip ?? null;
    this.#criadoEm = new Date(criadoEm);
  }

  // Cria o registro conferindo a regra de cada ação: criação só tem "depois", exclusão só tem
  // "antes" e atualização tem os dois.
  static registrar(dados: DadosParaRegistrar, agora: Date): AuditoriaLog {
    if (dados.entidade.trim().length === 0) throw new RangeError("Informe a entidade alterada.");
    if (dados.entidadeId.trim().length === 0) throw new RangeError("Informe o id da entidade alterada.");
    if (!ACOES_DE_AUDITORIA.includes(dados.acao)) throw new RangeError("Ação de auditoria inválida.");
    if (Number.isNaN(agora.getTime())) throw new RangeError("Data inválida.");
    const antes = dados.dadosAntes ?? null;
    const depois = dados.dadosDepois ?? null;
    if (dados.acao === "CRIACAO" && (antes !== null || depois === null)) {
      throw new RangeError("Uma criação tem só os dados de depois.");
    }
    if (dados.acao === "EXCLUSAO" && (antes === null || depois !== null)) {
      throw new RangeError("Uma exclusão tem só os dados de antes.");
    }
    if (dados.acao === "ATUALIZACAO" && (antes === null || depois === null)) {
      throw new RangeError("Uma atualização tem os dados de antes e de depois.");
    }
    return new AuditoriaLog(dados, agora);
  }

  get entidade(): string {
    return this.#entidade;
  }
  get entidadeId(): string {
    return this.#entidadeId;
  }
  get acao(): AcaoDeAuditoria {
    return this.#acao;
  }
  get dadosAntes(): Dados | null {
    return this.#dadosAntes;
  }
  get dadosDepois(): Dados | null {
    return this.#dadosDepois;
  }
  get usuarioId(): string | null {
    return this.#usuarioId;
  }
  get ip(): string | null {
    return this.#ip;
  }
  get criadoEm(): Date {
    return new Date(this.#criadoEm);
  }

  // Os campos que mudaram (na atualização), os campos criados ou os removidos, em ordem alfabética.
  diferencas(): Diferenca[] {
    const antes = this.#dadosAntes ?? {};
    const depois = this.#dadosDepois ?? {};
    const campos = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].sort();
    return campos
      .filter((campo) => JSON.stringify(antes[campo]) !== JSON.stringify(depois[campo]))
      .map((campo) => ({ campo, antes: antes[campo], depois: depois[campo] }));
  }

  // Filtra uma lista de registros e devolve do mais novo para o mais antigo.
  static consultar(logs: readonly AuditoriaLog[], filtro: FiltroDeAuditoria = {}): AuditoriaLog[] {
    return logs
      .filter(
        (l) =>
          (filtro.entidade === undefined || l.#entidade === filtro.entidade) &&
          (filtro.entidadeId === undefined || l.#entidadeId === filtro.entidadeId) &&
          (filtro.usuarioId === undefined || l.#usuarioId === filtro.usuarioId) &&
          (filtro.acao === undefined || l.#acao === filtro.acao) &&
          (filtro.desde === undefined || l.#criadoEm.getTime() >= filtro.desde.getTime()) &&
          (filtro.ate === undefined || l.#criadoEm.getTime() <= filtro.ate.getTime()),
      )
      .sort((a, b) => b.#criadoEm.getTime() - a.#criadoEm.getTime());
  }
}
