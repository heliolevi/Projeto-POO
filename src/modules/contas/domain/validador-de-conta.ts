import { Cpf } from "../../../shared/dominio/cpf.ts";
import { PoliticaDeSenha } from "../../../shared/dominio/politica-de-senha.ts";
import {
  ALTURA_MAX_CM,
  ALTURA_MIN_CM,
  ATIVIDADES,
  EXPERIENCIAS,
  ehAtividade,
  ehExperiencia,
  type Atividade,
  type Experiencia,
} from "../../../shared/dominio/ciclista.ts";

export type ErrosPorCampo = Record<string, string>;

export type DadosCadastro = {
  nome: string;
  email: string;
  senha: string;
  cpf: string;
  telefone: string | null;
  dataNascimento: string | null;
  alturaCm: number | null;
};

export type DadosLogin = { email: string; senha: string };
export type DadosAlterarSenha = { senhaAtual: string; novaSenha: string };

export type DadosPerfilCiclista = {
  alturaCm: number | null;
  experiencia: Experiencia | null;
  atividade: Atividade | null;
};

/** O resultado de toda validação: os dados limpos, ou uma mensagem por campo (o `details` do 400). */
export type Validacao<T> = { dados: T } | { erros: ErrosPorCampo };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ANO_MINIMO_DE_NASCIMENTO = 1900;

// PUT /api/conta/perfil-ciclista substitui os três campos de uma vez. Cada um pode vir ausente
// ou null, e então o dado é apagado. A altura passa pelo mesmo validador da rota de altura.
// Mas o corpo precisa trazer ao menos uma das três chaves, e SÓ elas: um `{}` ou um nome de campo
// errado (ex.: "altura" em vez de "alturaCm", ou "atividde" ao lado de um campo certo) apagaria o
// dado em silêncio, então é 400. Qualquer chave desconhecida também é 400, inclusive `id` e `perfil`:
// o alvo é sempre a conta do token e nada do corpo o muda. Para apagar tudo de propósito, envie as
// três chaves como null.
const CAMPOS_DO_PERFIL = ["alturaCm", "experiencia", "atividade"] as const;

// Os nomes voltam na mensagem de erro; poucos e curtos, para um corpo grande não virar eco. O corte
// é por caractere inteiro (Array.from), e não por unidade UTF-16 (slice): cortar com slice pode partir
// um emoji ao meio e deixar um caractere quebrado na mensagem.
function listarChaves(chaves: string[]): string {
  const nomes = chaves.slice(0, 5).map((c) => Array.from(c).slice(0, 40).join(""));
  return nomes.join(", ") + (chaves.length > nomes.length ? ", ..." : "");
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

function comoObjeto(entrada: unknown): Record<string, unknown> {
  return entrada && typeof entrada === "object" && !Array.isArray(entrada)
    ? (entrada as Record<string, unknown>)
    : {};
}

// Valida o que chega nas rotas de conta (cadastro, login, troca de senha, altura, perfil do ciclista e
// termos). A política de senha e o relógio entram pelo construtor: a mesma PoliticaDeSenha que o
// navegador mostra na tela, e um relógio que os testes podem congelar (a data de nascimento não pode
// estar no futuro).
export class ValidadorDeConta {
  readonly #politica: PoliticaDeSenha;
  readonly #agora: () => Date;

  constructor(opcoes: { politica?: PoliticaDeSenha; agora?: () => Date } = {}) {
    this.#politica = opcoes.politica ?? new PoliticaDeSenha();
    this.#agora = opcoes.agora ?? (() => new Date());
  }

  /** O CPF chega só com os 11 dígitos (o cadastro tira a máscara antes). */
  #cpfValido(cpf: string): boolean {
    return /^\d{11}$/.test(cpf) && Cpf.de(cpf) !== null;
  }

  #dataDeNascimentoValida(valor: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
    const data = new Date(`${valor}T00:00:00Z`);
    if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) return false;
    return data.getTime() <= this.#agora().getTime() && data.getUTCFullYear() >= ANO_MINIMO_DE_NASCIMENTO;
  }

  /** A mensagem de erro de uma senha nova, ou null se ela serve (tamanho, letra e número). */
  #problemaDaSenhaNova(senha: string | null): string | null {
    if (senha === null || !this.#politica.tamanhoValido(senha)) {
      return `A senha deve ter de ${this.#politica.min} a ${this.#politica.max} caracteres.`;
    }
    if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return "A senha deve ter ao menos uma letra e um número.";
    return null;
  }

  #alturaValida(valor: unknown): valor is number {
    return typeof valor === "number" && Number.isInteger(valor) && valor >= ALTURA_MIN_CM && valor <= ALTURA_MAX_CM;
  }

  cadastro(entrada: unknown): Validacao<DadosCadastro> {
    const corpo = comoObjeto(entrada);
    const erros: ErrosPorCampo = {};

    const nome = texto(corpo.nome)?.trim().replace(/\s+/g, " ") ?? "";
    if (nome.length < 3 || nome.length > 120) erros.nome = "Informe o nome completo (3 a 120 caracteres).";

    const email = texto(corpo.email)?.trim().toLowerCase() ?? "";
    if (email.length > 254 || !EMAIL.test(email)) erros.email = "E-mail inválido.";

    const senha = texto(corpo.senha);
    const problemaDaSenha = this.#problemaDaSenhaNova(senha);
    if (problemaDaSenha) erros.senha = problemaDaSenha;

    const cpf = (texto(corpo.cpf) ?? "").replace(/[.\-\s]/g, "");
    if (!this.#cpfValido(cpf)) erros.cpf = "CPF inválido.";

    let telefone: string | null = null;
    if (corpo.telefone != null && corpo.telefone !== "") {
      const digitos = (texto(corpo.telefone) ?? "").replace(/[\s()\-+]/g, "");
      if (/^\d{10,13}$/.test(digitos)) telefone = digitos;
      else erros.telefone = "Telefone inválido (informe DDD e número).";
    }

    let dataNascimento: string | null = null;
    if (corpo.dataNascimento != null && corpo.dataNascimento !== "") {
      const valor = texto(corpo.dataNascimento);
      if (valor !== null && this.#dataDeNascimentoValida(valor)) dataNascimento = valor;
      else erros.dataNascimento = "Data inválida (use AAAA-MM-DD).";
    }

    let alturaCm: number | null = null;
    if (corpo.alturaCm != null && corpo.alturaCm !== "") {
      if (this.#alturaValida(corpo.alturaCm)) alturaCm = corpo.alturaCm;
      else erros.alturaCm = "Altura deve ser um inteiro entre 100 e 250 (cm).";
    }

    if (corpo.aceiteTermos !== true) erros.aceiteTermos = "É necessário aceitar os termos de uso.";

    if (Object.keys(erros).length > 0) return { erros };
    return { dados: { nome, email, senha: senha as string, cpf, telefone, dataNascimento, alturaCm } };
  }

  login(entrada: unknown): Validacao<DadosLogin> {
    const corpo = comoObjeto(entrada);
    const erros: ErrosPorCampo = {};
    const email = texto(corpo.email)?.trim().toLowerCase() ?? "";
    const senha = texto(corpo.senha);
    if (!email || email.length > 254) erros.email = "Informe o e-mail.";
    if (!senha || senha.length > this.#politica.max) erros.senha = "Informe a senha.";
    if (Object.keys(erros).length > 0) return { erros };
    return { dados: { email, senha: senha as string } };
  }

  alterarSenha(entrada: unknown): Validacao<DadosAlterarSenha> {
    const corpo = comoObjeto(entrada);
    const erros: ErrosPorCampo = {};
    // o teto evita gastar scrypt com uma "senha" de vários KiB
    const senhaAtual = texto(corpo.senhaAtual);
    if (!senhaAtual || senhaAtual.length > this.#politica.max) erros.senhaAtual = "Informe a senha atual.";

    const novaSenha = texto(corpo.novaSenha);
    const problema = this.#problemaDaSenhaNova(novaSenha);
    if (problema) {
      erros.novaSenha = problema;
    } else if (senhaAtual && (novaSenha as string).normalize("NFKC") === senhaAtual.normalize("NFKC")) {
      // mesma normalização do hash (ScryptDeSenha), para "igual" valer como no login
      erros.novaSenha = "A nova senha precisa ser diferente da atual.";
    }

    if (Object.keys(erros).length > 0) return { erros };
    return { dados: { senhaAtual: senhaAtual as string, novaSenha: novaSenha as string } };
  }

  altura(entrada: unknown): Validacao<number> {
    const valor = comoObjeto(entrada).alturaCm;
    if (this.#alturaValida(valor)) return { dados: valor };
    return { erros: { alturaCm: "Altura deve ser um inteiro entre 100 e 250 (cm)." } };
  }

  perfilCiclista(entrada: unknown): Validacao<DadosPerfilCiclista> {
    if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
      return { erros: { corpo: "Envie um objeto JSON com alturaCm, experiencia e atividade." } };
    }
    const corpo = entrada as Record<string, unknown>;
    const desconhecidas = Object.keys(corpo).filter((chave) => !(CAMPOS_DO_PERFIL as readonly string[]).includes(chave));
    if (desconhecidas.length > 0) {
      return {
        erros: {
          corpo: `Campo desconhecido: ${listarChaves(desconhecidas)}. Use apenas alturaCm, experiencia e atividade.`,
        },
      };
    }
    if (!CAMPOS_DO_PERFIL.some((campo) => campo in corpo)) {
      return {
        erros: {
          corpo: "Envie ao menos um destes campos: alturaCm, experiencia ou atividade (null apaga o dado).",
        },
      };
    }
    const erros: ErrosPorCampo = {};

    let alturaCm: number | null = null;
    if (corpo.alturaCm !== undefined && corpo.alturaCm !== null) {
      const altura = this.altura({ alturaCm: corpo.alturaCm });
      if ("erros" in altura) erros.alturaCm = altura.erros.alturaCm;
      else alturaCm = altura.dados;
    }

    let experiencia: Experiencia | null = null;
    if (corpo.experiencia !== undefined && corpo.experiencia !== null) {
      if (ehExperiencia(corpo.experiencia)) experiencia = corpo.experiencia;
      else erros.experiencia = `Experiência inválida. Use um destes valores: ${EXPERIENCIAS.join(", ")}.`;
    }

    let atividade: Atividade | null = null;
    if (corpo.atividade !== undefined && corpo.atividade !== null) {
      if (ehAtividade(corpo.atividade)) atividade = corpo.atividade;
      else erros.atividade = `Atividade inválida. Use um destes valores: ${ATIVIDADES.join(", ")}.`;
    }

    if (Object.keys(erros).length > 0) return { erros };
    return { dados: { alturaCm, experiencia, atividade } };
  }

  /** Só a versão vigente pode ser aceita: o cliente não registra aceite de um texto que não leu. */
  aceiteDeTermos(entrada: unknown, versaoVigente: string): Validacao<string> {
    const versao = texto(comoObjeto(entrada).versao)?.trim() ?? "";
    if (!versao || versao.length > 32) return { erros: { versao: "Informe a versão dos termos aceita." } };
    if (versao !== versaoVigente) return { erros: { versao: `A versão vigente dos termos é ${versaoVigente}.` } };
    return { dados: versao };
  }
}
