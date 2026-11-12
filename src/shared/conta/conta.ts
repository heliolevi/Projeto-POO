import { ALTURA_MAX_CM, ALTURA_MIN_CM, alturaValida } from "../dominio/ciclista.ts";

// Regras da tela "Minha conta". Espelham o servidor (validacao.ts) para dar a resposta na
// hora; quem decide de verdade continua sendo a API.
const SENHA_MIN = 8;
const SENHA_MAX = 128;

export type FormularioSenha = { senhaAtual: string; novaSenha: string; confirmar: string };
export type ErrosSenha = Partial<Record<keyof FormularioSenha, string>>;

export function validarTrocaDeSenha(form: FormularioSenha): ErrosSenha {
  const erros: ErrosSenha = {};
  if (form.senhaAtual === "") erros.senhaAtual = "Informe a senha atual.";

  const nova = form.novaSenha;
  if (nova.length < SENHA_MIN || nova.length > SENHA_MAX) {
    erros.novaSenha = `A senha deve ter de ${SENHA_MIN} a ${SENHA_MAX} caracteres.`;
  } else if (!/[A-Za-z]/.test(nova) || !/\d/.test(nova)) {
    erros.novaSenha = "A senha deve ter ao menos uma letra e um número.";
  } else if (form.senhaAtual !== "" && nova.normalize("NFKC") === form.senhaAtual.normalize("NFKC")) {
    erros.novaSenha = "A nova senha precisa ser diferente da atual.";
  }

  if (form.confirmar !== nova) erros.confirmar = "As senhas não coincidem.";
  return erros;
}

export function validarAltura(texto: string): { alturaCm: number } | { erro: string } {
  const limpo = texto.trim();
  if (/^\d+$/.test(limpo) && alturaValida(Number(limpo))) return { alturaCm: Number(limpo) };
  return { erro: `Informe a altura em centímetros, de ${ALTURA_MIN_CM} a ${ALTURA_MAX_CM}.` };
}

export const CONFIRMACAO_DESATIVAR = "DESATIVAR";

export function confirmacaoValida(texto: string): boolean {
  return texto.trim() === CONFIRMACAO_DESATIVAR;
}

type ErroDaApi = { code: string; message: string };

// Texto para a pessoa. Em "senha", um 401 com a sessão ainda válida é senha atual errada.
export function mensagemDeErro(erro: ErroDaApi, contexto?: "senha"): string {
  switch (erro.code) {
    case "TOO_MANY_REQUESTS":
      return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
    case "UNAUTHORIZED":
      return contexto === "senha"
        ? "A senha atual está incorreta."
        : "Sua sessão terminou. Entre de novo para continuar.";
    case "PAYLOAD_TOO_LARGE":
      return "Os dados enviados são grandes demais.";
    case "VALIDATION_ERROR":
    case "FORBIDDEN":
      return erro.message;
    default:
      return "Não foi possível concluir agora. Tente novamente em instantes.";
  }
}
