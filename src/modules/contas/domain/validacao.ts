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
  const senhaAtual = texto(corpo.senhaAtual);
  if (!senhaAtual) erros.senhaAtual = "Informe a senha atual.";

  const novaSenha = texto(corpo.novaSenha);
  if (novaSenha === null || novaSenha.length < SENHA_MIN || novaSenha.length > SENHA_MAX) {
    erros.novaSenha = `A senha deve ter de ${SENHA_MIN} a ${SENHA_MAX} caracteres.`;
  } else if (!/[A-Za-z]/.test(novaSenha) || !/\d/.test(novaSenha)) {
    erros.novaSenha = "A senha deve ter ao menos uma letra e um número.";
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

export function validarAceiteTermos(
  entrada: unknown,
): { dados: string } | { erros: ErrosPorCampo } {
  const corpo = comoObjeto(entrada);
  const versao = texto(corpo.versao);
  if (!versao) return { erros: { versao: "Informe a versão dos termos aceita." } };
  return { dados: versao };
}
