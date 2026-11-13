// O ponto de retirada e devolução da locadora (há um só, mas o modelo aceita mais).

// São Luís fica no fuso UTC-3 o ano todo (sem horário de verão).
const DESLOCAMENTO_SAO_LUIS_MS = -3 * 60 * 60 * 1000;
const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Um dia da semana com horário de funcionamento; dia 0 é domingo (como no jsonb do banco).
export type Horario = { diaSemana: number; abre: string; fecha: string };

// Como o horário vem do banco: a coluna ponto.horarios é um jsonb com a chave dia_semana.
export type HorarioDoBanco = { dia_semana: number; abre: string; fecha: string };

// Converte o jsonb do banco para o Horario do domínio. O repositório do ponto usa isto ao montar o Ponto.
export function horarioDoBanco(linha: HorarioDoBanco): Horario {
  return { diaSemana: linha.dia_semana, abre: linha.abre, fecha: linha.fecha };
}

export type Endereco = {
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  cep: string;
  cidade: string;
  uf: string;
};

export type Localizacao = { latitude: number; longitude: number };

export type DadosPonto = {
  id: string;
  nome: string;
  endereco: Endereco;
  localizacao?: Localizacao | null;
  telefone?: string | null;
  horarios: readonly Horario[];
  ativo: boolean;
};

function minutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

export class Ponto {
  readonly #id: string;
  readonly #nome: string;
  readonly #endereco: Endereco;
  readonly #localizacao: Localizacao | null;
  readonly #telefone: string | null;
  readonly #horarios: readonly Horario[];
  #ativo: boolean;

  constructor(dados: DadosPonto) {
    if (!dados.id) throw new RangeError("O ponto precisa de um id.");
    if (dados.nome.trim().length === 0) throw new RangeError("O ponto precisa de um nome.");
    if (!/^[0-9]{8}$/.test(dados.endereco.cep)) throw new RangeError("O CEP precisa ter 8 dígitos.");
    if (!/^[A-Z]{2}$/.test(dados.endereco.uf)) throw new RangeError("A UF precisa ter 2 letras maiúsculas.");
    const dias = new Set<number>();
    for (const h of dados.horarios) {
      if (!Number.isInteger(h.diaSemana) || h.diaSemana < 0 || h.diaSemana > 6) {
        throw new RangeError("O dia da semana vai de 0 (domingo) a 6 (sábado).");
      }
      if (!HORA.test(h.abre) || !HORA.test(h.fecha) || minutos(h.abre) >= minutos(h.fecha)) {
        throw new RangeError("O horário de abertura precisa ser antes do de fechamento (HH:MM).");
      }
      if (dias.has(h.diaSemana)) throw new RangeError("Há dois horários para o mesmo dia da semana.");
      dias.add(h.diaSemana);
    }
    const loc = dados.localizacao ?? null;
    if (loc && (Math.abs(loc.latitude) > 90 || Math.abs(loc.longitude) > 180)) {
      throw new RangeError("Localização fora dos limites de latitude e longitude.");
    }
    this.#id = dados.id;
    this.#nome = dados.nome;
    this.#endereco = { ...dados.endereco };
    this.#localizacao = loc ? { ...loc } : null;
    this.#telefone = dados.telefone ?? null;
    this.#horarios = dados.horarios.map((h) => ({ ...h }));
    this.#ativo = dados.ativo;
  }

  get id(): string {
    return this.#id;
  }
  get nome(): string {
    return this.#nome;
  }
  get endereco(): Endereco {
    return { ...this.#endereco };
  }
  get localizacao(): Localizacao | null {
    return this.#localizacao ? { ...this.#localizacao } : null;
  }
  get telefone(): string | null {
    return this.#telefone;
  }
  get horarios(): readonly Horario[] {
    return this.#horarios.map((h) => ({ ...h }));
  }
  get ativo(): boolean {
    return this.#ativo;
  }

  // "Rua, 100, Bairro, Cidade (UF)": o texto que as telas mostram.
  enderecoCompleto(): string {
    const e = this.#endereco;
    const numero = e.complemento ? `${e.numero}, ${e.complemento}` : e.numero;
    return `${e.logradouro}, ${numero}, ${e.bairro}, ${e.cidade} (${e.uf})`;
  }

  // Aberto no instante dado (no horário de São Luís): o ponto precisa estar ativo, ter horário
  // naquele dia da semana e o horário local estar entre a abertura (inclusive) e o fechamento
  // (exclusive).
  estaAberto(dataHora: Date): boolean {
    if (!this.#ativo) return false;
    const local = new Date(dataHora.getTime() + DESLOCAMENTO_SAO_LUIS_MS);
    if (Number.isNaN(local.getTime())) return false;
    const horario = this.#horarios.find((h) => h.diaSemana === local.getUTCDay());
    if (!horario) return false;
    const agora = local.getUTCHours() * 60 + local.getUTCMinutes();
    return agora >= minutos(horario.abre) && agora < minutos(horario.fecha);
  }

  desativar(): void {
    this.#ativo = false;
  }

  reativar(): void {
    this.#ativo = true;
  }
}
