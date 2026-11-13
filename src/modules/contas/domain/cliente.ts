import { alturaValida, ehAtividade, ehExperiencia } from "../../../shared/dominio/ciclista.ts";
import { ValidationError } from "../../../shared/http/errors.ts";
import { Usuario, type DadosUsuario, type Permissao } from "./usuario-base.ts";
import type { ContaLogada, PerfilCiclistaConta, PerfilUsuario } from "./usuario.ts";

export const PERMISSOES_DO_CLIENTE: readonly Permissao[] = [
  "reserva:criar",
  "reserva:ver-proprias",
  "reserva:cancelar-propria",
  "recomendacao:buscar",
  "conta:gerir-propria",
];

export type DadosCliente = DadosUsuario & {
  cpf?: string | null;
  dataNascimento?: string | null;
  ciclista?: Partial<PerfilCiclistaConta>;
  aceiteTermosEm?: Date | null;
  versaoTermos?: string | null;
};

// O campo veio (nem undefined, nem null) e não passa na validação.
const invalido = (valor: unknown, valido: (v: unknown) => boolean) =>
  valor !== undefined && valor !== null && !valido(valor);

const SEM_PERFIL: PerfilCiclistaConta = { alturaCm: null, experiencia: null, atividade: null };

// Quem aluga. Além da conta, carrega os dados do ciclista que a recomendação usa (altura,
// experiência e atividade, qualquer um pode faltar) e o aceite dos termos.
export class Cliente extends Usuario {
  readonly #cpf: string | null;
  readonly #dataNascimento: string | null;
  #ciclista: PerfilCiclistaConta;
  #aceiteTermosEm: Date | null;
  #versaoTermos: string | null;

  constructor(dados: DadosCliente) {
    super(dados);
    this.#cpf = dados.cpf ?? null;
    this.#dataNascimento = dados.dataNascimento ?? null;
    this.#ciclista = { ...SEM_PERFIL, ...dados.ciclista };
    this.#aceiteTermosEm = dados.aceiteTermosEm ?? null;
    this.#versaoTermos = dados.versaoTermos ?? null;
  }

  get perfil(): PerfilUsuario {
    return "CLIENTE";
  }

  permissoes(): readonly Permissao[] {
    return PERMISSOES_DO_CLIENTE;
  }

  get cpf(): string | null {
    return this.#cpf;
  }
  get dataNascimento(): string | null {
    return this.#dataNascimento;
  }
  get aceiteTermosEm(): Date | null {
    return this.#aceiteTermosEm === null ? null : new Date(this.#aceiteTermosEm);
  }
  get versaoTermos(): string | null {
    return this.#versaoTermos;
  }
  // cópia: quem recebe não altera o perfil por fora
  get ciclista(): PerfilCiclistaConta {
    return { ...this.#ciclista };
  }

  aceitarTermos(versao: string, agora: Date): void {
    if (versao.trim().length === 0) throw new RangeError("Informe a versão dos termos aceita.");
    this.#aceiteTermosEm = new Date(agora);
    this.#versaoTermos = versao;
  }

  temAceiteDosTermos(versaoAtual: string): boolean {
    return this.#aceiteTermosEm !== null && this.#versaoTermos === versaoAtual;
  }

  // O que não for informado (undefined) fica como está; null apaga. Valida tudo antes de gravar
  // qualquer um: ou entra tudo ou não entra nada.
  atualizarPerfilCiclista(dados: Partial<PerfilCiclistaConta>): void {
    const erros: Record<string, string> = {};
    if (invalido(dados.alturaCm, alturaValida)) erros.alturaCm = "Altura inválida (inteiro entre 100 e 250 cm).";
    if (invalido(dados.experiencia, ehExperiencia)) erros.experiencia = "Experiência inválida.";
    if (invalido(dados.atividade, ehAtividade)) erros.atividade = "Atividade inválida.";
    if (Object.keys(erros).length > 0) throw new ValidationError("Dados inválidos.", erros);
    const novo = { ...this.#ciclista };
    if (dados.alturaCm !== undefined) novo.alturaCm = dados.alturaCm;
    if (dados.experiencia !== undefined) novo.experiencia = dados.experiencia;
    if (dados.atividade !== undefined) novo.atividade = dados.atividade;
    this.#ciclista = novo;
  }

  paraConta(): ContaLogada {
    return { ...this.paraPublico(), ciclista: this.ciclista };
  }
}
