import {
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

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const SENHA_MIN = 8;
const SENHA_MAX = 128;

export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i);
    const digito = ((soma * 10) % 11) % 10;
    if (digito !== Number(cpf[tamanho])) return false;
  }
  return true;
}

function dataValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const data = new Date(`${texto}T00:00:00Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== texto) {
    return false;
  }
  return data.getTime() <= Date.now() && data.getUTCFullYear() >= 1900;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

function comoObjeto(entrada: unknown): Record<string, unknown> {
  return entrada && typeof entrada === "object" && !Array.isArray(entrada)
    ? (entrada as Record<string, unknown>)
    : {};
}

export function validarCadastro(
  entrada: unknown,
): { dados: DadosCadastro } | { erros: ErrosPorCampo } {
  const corpo = comoObjeto(entrada);
  const erros: ErrosPorCampo = {};

  const nome = texto(corpo.nome)?.trim().replace(/\s+/g, " ") ?? "";
  if (nome.length < 3 || nome.length > 120) {
    erros.nome = "Informe o nome completo (3 a 120 caracteres).";
  }

  const email = texto(corpo.email)?.trim().toLowerCase() ?? "";
  if (email.length > 254 || !EMAIL.test(email)) erros.email = "E-mail inválido.";

  const senha = texto(corpo.senha);
  if (senha === null || senha.length < SENHA_MIN || senha.length > SENHA_MAX) {
    erros.senha = `A senha deve ter de ${SENHA_MIN} a ${SENHA_MAX} caracteres.`;
  } else if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) {
    erros.senha = "A senha deve ter ao menos uma letra e um número.";
  }

  const cpf = (texto(corpo.cpf) ?? "").replace(/[.\-\s]/g, "");
  if (!cpfValido(cpf)) erros.cpf = "CPF inválido.";

  let telefone: string | null = null;
  if (corpo.telefone != null && corpo.telefone !== "") {
    const digitos = (texto(corpo.telefone) ?? "").replace(/[\s()\-+]/g, "");
    if (/^\d{10,13}$/.test(digitos)) telefone = digitos;
    else erros.telefone = "Telefone inválido (informe DDD e número).";
  }

  let dataNascimento: string | null = null;
  if (corpo.dataNascimento != null && corpo.dataNascimento !== "") {
    const valor = texto(corpo.dataNascimento);
    if (valor !== null && dataValida(valor)) dataNascimento = valor;
    else erros.dataNascimento = "Data inválida (use AAAA-MM-DD).";
  }

  let alturaCm: number | null = null;
  if (corpo.alturaCm != null && corpo.alturaCm !== "") {
    const valor = corpo.alturaCm;
    if (typeof valor === "number" && Number.isInteger(valor) && valor >= 100 && valor <= 250) {
      alturaCm = valor;
    } else {
      erros.alturaCm = "Altura deve ser um inteiro entre 100 e 250 (cm).";
    }
  }

  if (corpo.aceiteTermos !== true) {
    erros.aceiteTermos = "É necessário aceitar os termos de uso.";
  }

  if (Object.keys(erros).length > 0) return { erros };
  return {
    dados: { nome, email, senha: senha as string, cpf, telefone, dataNascimento, alturaCm },
  };
}

export function validarLogin(
  entrada: unknown,
): { dados: DadosLogin } | { erros: ErrosPorCampo } {
  const corpo = comoObjeto(entrada);
  const erros: ErrosPorCampo = {};
  const email = texto(corpo.email)?.trim().toLowerCase() ?? "";
  const senha = texto(corpo.senha);
  if (!email || email.length > 254) erros.email = "Informe o e-mail.";
  if (!senha || senha.length > SENHA_MAX) erros.senha = "Informe a senha.";
  if (Object.keys(erros).length > 0) return { erros };
  return { dados: { email, senha: senha as string } };
}

export type DadosAlterarSenha = { senhaAtual: string; novaSenha: string };

export function validarAlterarSenha(
  entrada: unknown,
): { dados: DadosAlterarSenha } | { erros: ErrosPorCampo } {
  const corpo = comoObjeto(entrada);
  const erros: ErrosPorCampo = {};
  // o teto evita gastar scrypt com uma "senha" de vários KiB
  const senhaAtual = texto(corpo.senhaAtual);
  if (!senhaAtual || senhaAtual.length > SENHA_MAX) erros.senhaAtual = "Informe a senha atual.";

  const novaSenha = texto(corpo.novaSenha);
  if (novaSenha === null || novaSenha.length < SENHA_MIN || novaSenha.length > SENHA_MAX) {
    erros.novaSenha = `A senha deve ter de ${SENHA_MIN} a ${SENHA_MAX} caracteres.`;
  } else if (!/[A-Za-z]/.test(novaSenha) || !/\d/.test(novaSenha)) {
    erros.novaSenha = "A senha deve ter ao menos uma letra e um número.";
  } else if (senhaAtual && novaSenha.normalize("NFKC") === senhaAtual.normalize("NFKC")) {
    // mesma normalização do hash (senha.ts), para "igual" valer como no login
    erros.novaSenha = "A nova senha precisa ser diferente da atual.";
  }

  if (Object.keys(erros).length > 0) return { erros };
  return { dados: { senhaAtual: senhaAtual as string, novaSenha: novaSenha as string } };
}

export function validarAltura(entrada: unknown): { dados: number } | { erros: ErrosPorCampo } {
  const corpo = comoObjeto(entrada);
  const valor = corpo.alturaCm;
  if (typeof valor === "number" && Number.isInteger(valor) && valor >= 100 && valor <= 250) {
    return { dados: valor };
  }
  return { erros: { alturaCm: "Altura deve ser um inteiro entre 100 e 250 (cm)." } };
}

export type DadosPerfilCiclista = {
  alturaCm: number | null;
  experiencia: Experiencia | null;
  atividade: Atividade | null;
};

// PUT /api/conta/perfil-ciclista substitui os três campos de uma vez. Cada um pode vir ausente
// ou null, e então o dado é apagado. A altura passa pelo mesmo validador da rota de altura.
// Mas o corpo precisa trazer ao menos uma das três chaves, e SÓ elas: um `{}` ou um nome de campo
// errado (ex.: "altura" em vez de "alturaCm", ou "atividde" ao lado de um campo certo) apagaria o
// dado em silêncio, então é 400. Qualquer chave desconhecida também é 400, inclusive `id` e `perfil`:
// o alvo é sempre a conta do token e nada do corpo o muda. Para apagar tudo de propósito, envie as
// três chaves como null.
const CAMPOS_DO_PERFIL = ["alturaCm", "experiencia", "atividade"] as const;

// Os nomes voltam na mensagem de erro; poucos e curtos, para um corpo grande não virar eco.
function listarChaves(chaves: string[]): string {
  const nomes = chaves.slice(0, 5).map((c) => c.slice(0, 40));
  return nomes.join(", ") + (chaves.length > nomes.length ? ", ..." : "");
}

export function validarPerfilCiclista(
  entrada: unknown,
): { dados: DadosPerfilCiclista } | { erros: ErrosPorCampo } {
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
    return { erros: { corpo: "Envie um objeto JSON com alturaCm, experiencia e atividade." } };
  }
  const corpo = entrada as Record<string, unknown>;
  const desconhecidas = Object.keys(corpo).filter(
    (chave) => !(CAMPOS_DO_PERFIL as readonly string[]).includes(chave),
  );
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
    const altura = validarAltura({ alturaCm: corpo.alturaCm });
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

// Só a versão vigente pode ser aceita: o cliente não registra aceite de um texto que não leu.
export function validarAceiteTermos(
  entrada: unknown,
  versaoVigente: string,
): { dados: string } | { erros: ErrosPorCampo } {
  const corpo = comoObjeto(entrada);
  const versao = texto(corpo.versao)?.trim() ?? "";
  if (!versao || versao.length > 32) {
    return { erros: { versao: "Informe a versão dos termos aceita." } };
  }
  if (versao !== versaoVigente) {
    return { erros: { versao: `A versão vigente dos termos é ${versaoVigente}.` } };
  }
  return { dados: versao };
}
