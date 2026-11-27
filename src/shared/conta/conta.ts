import { ApiError } from "../http/api-cliente.ts";
import { ALTURA_MAX_CM, ALTURA_MIN_CM, RegrasDoCiclista } from "../dominio/ciclista.ts";

// Regras da tela "Minha conta". Espelham o servidor (validacao.ts) para dar a resposta na
// hora; quem decide de verdade continua sendo a API.
const SENHA_MIN = 8;
const SENHA_MAX = 128;

export type FormularioSenha = { senhaAtual: string; novaSenha: string; confirmar: string };
export type ErrosSenha = Partial<Record<keyof FormularioSenha, string>>;

// O formulário de troca de senha com a regra em cima dos dados. Imutável: guarda uma cópia.
export class FormularioDeSenha {
  #dados: Readonly<FormularioSenha>;

  constructor(dados: FormularioSenha) {
    this.#dados = Object.freeze({ ...dados });
  }

  validar(): ErrosSenha {
    const form = this.#dados;
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
}

// A altura digitada na tela "Minha conta". Só tem método estático, então não se cria instância.
export class AlturaDaConta {
  private constructor() {
    throw new Error("AlturaDaConta só tem métodos estáticos.");
  }

  static validar(texto: string): { alturaCm: number } | { erro: string } {
    const limpo = texto.trim();
    if (/^\d+$/.test(limpo) && RegrasDoCiclista.alturaValida(Number(limpo))) return { alturaCm: Number(limpo) };
    return { erro: `Informe a altura em centímetros, de ${ALTURA_MIN_CM} a ${ALTURA_MAX_CM}.` };
  }
}

// Só o cliente desativa a própria conta pela tela. As contas de equipe (OPERADOR e ADMIN) são
// criadas por script (T28) e não há tela para recriá-las: um clique tiraria a única conta de
// equipe da locadora. A API ainda aceita os três perfis (contrato, rota 8).
export class DesativacaoDaConta {
  static readonly CONFIRMACAO = "DESATIVAR";

  private constructor() {
    throw new Error("DesativacaoDaConta só tem métodos estáticos.");
  }

  static permitidaPara(perfil: string): boolean {
    return perfil === "CLIENTE";
  }

  static confirmacaoValida(texto: string): boolean {
    return texto.trim() === DesativacaoDaConta.CONFIRMACAO;
  }
}

type ErroDaApi = { code: string; message: string };

// Texto para a pessoa a partir do erro da API. Em "senha", um 401 com a sessão ainda válida é
// senha atual errada.
export class MensagensDeErroDaConta {
  private constructor() {
    throw new Error("MensagensDeErroDaConta só tem métodos estáticos.");
  }

  // Qualquer falha de uma chamada: erro da API vira o texto do código; o resto (rede, código) mostra
  // um texto sobre a conexão.
  static daFalha(erro: unknown): string {
    return erro instanceof ApiError
      ? MensagensDeErroDaConta.de(erro)
      : "Não foi possível concluir agora. Verifique a conexão e tente novamente.";
  }

  static de(erro: ErroDaApi, contexto?: "senha"): string {
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
}
