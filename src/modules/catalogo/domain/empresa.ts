import { somenteDigitos } from "../../../shared/format/cpf.ts";

// A locadora, como "pessoa jurídica": existe um único registro no banco (empresa.id é um boolean
// fixo em true). O CNPJ, a razão social e a conta de recebimento nunca chegam ao público.

export type DadosEmpresa = {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  email: string;
  telefone?: string | null;
  documentosExigidos?: readonly string[];
  contaRecebimentoId?: string | null;
};

// Valida o CNPJ pelos dois dígitos verificadores (14 dígitos, não todos iguais).
export function cnpjValido(cnpj: string): boolean {
  const d = somenteDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const digito = (base: string): number => {
    let peso = base.length - 7;
    let soma = 0;
    for (const c of base) {
      soma += Number(c) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(d.slice(0, 12)) === Number(d[12]) && digito(d.slice(0, 13)) === Number(d[13]);
}

export class Empresa {
  #razaoSocial: string;
  #nomeFantasia: string;
  #cnpj: string;
  #email: string;
  #telefone: string | null;
  #documentosExigidos: string[];
  #contaRecebimentoId: string | null;

  constructor(dados: DadosEmpresa) {
    this.#razaoSocial = "";
    this.#nomeFantasia = "";
    this.#cnpj = "";
    this.#email = "";
    this.#telefone = null;
    this.#documentosExigidos = [];
    this.#contaRecebimentoId = null;
    this.atualizarDados(dados);
  }

  get razaoSocial(): string {
    return this.#razaoSocial;
  }
  get nomeFantasia(): string {
    return this.#nomeFantasia;
  }
  get cnpj(): string {
    return this.#cnpj;
  }
  get email(): string {
    return this.#email;
  }
  get telefone(): string | null {
    return this.#telefone;
  }
  get documentosExigidos(): readonly string[] {
    return [...this.#documentosExigidos];
  }
  get contaRecebimentoId(): string | null {
    return this.#contaRecebimentoId;
  }

  // Troca todos os dados de uma vez; valida tudo antes de alterar qualquer campo.
  atualizarDados(dados: DadosEmpresa): void {
    if (dados.razaoSocial.trim().length === 0) throw new RangeError("Informe a razão social.");
    if (dados.nomeFantasia.trim().length === 0) throw new RangeError("Informe o nome fantasia.");
    if (!cnpjValido(dados.cnpj)) throw new RangeError("CNPJ inválido.");
    if (!dados.email.includes("@")) throw new RangeError("E-mail inválido.");
    this.#razaoSocial = dados.razaoSocial.trim();
    this.#nomeFantasia = dados.nomeFantasia.trim();
    this.#cnpj = somenteDigitos(dados.cnpj);
    this.#email = dados.email.trim();
    this.#telefone = dados.telefone ?? null;
    this.#documentosExigidos = [...(dados.documentosExigidos ?? [])];
    this.#contaRecebimentoId = dados.contaRecebimentoId ?? null;
  }

  // O que o público pode ver: sem CNPJ, razão social nem conta de recebimento.
  paraPublico(): { nomeFantasia: string; email: string; telefone: string | null; documentosExigidos: string[] } {
    return {
      nomeFantasia: this.#nomeFantasia,
      email: this.#email,
      telefone: this.#telefone,
      documentosExigidos: [...this.#documentosExigidos],
    };
  }
}
