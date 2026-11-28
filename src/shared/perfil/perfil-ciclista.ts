import {
  ALTURA_MAX_CM,
  ALTURA_MIN_CM,
  RegrasDoCiclista,
  type Atividade,
  type Experiencia,
} from "../dominio/ciclista.ts";

// Dados do ciclista como a API devolve (GET /api/conta/me) e recebe (PUT /api/conta/perfil-ciclista).
export type PerfilCiclista = {
  alturaCm: number | null;
  experiencia: Experiencia | null;
  atividade: Atividade | null;
};

export type ContaLogada = {
  id: string;
  perfil: "CLIENTE" | "OPERADOR" | "ADMIN";
  nome: string;
  email: string;
  ciclista?: PerfilCiclista;
};

// O formulário trabalha com texto: campo vazio quer dizer "não informado".
export type FormularioPerfil = { altura: string; experiencia: string; atividade: string };

export type ErrosPerfil = Partial<Record<keyof FormularioPerfil | "corpo", string>>;

// Altura de partida para os botões − e + quando o campo está vazio: perto da média de adultos.
const ALTURA_INICIAL_CM = 170;

// O formulário do perfil com as regras em cima dos dados (texto: campo vazio quer dizer "não
// informado"). É imutável: guarda uma cópia e, para trocar um campo, devolve outro formulário.
export class FormularioDePerfil {
  #dados: Readonly<FormularioPerfil>;

  constructor(dados: FormularioPerfil) {
    this.#dados = Object.freeze({ ...dados });
  }

  /** O formulário preenchido com o que a conta já tem; o que é null fica vazio. */
  static inicial(ciclista?: PerfilCiclista | null): FormularioDePerfil {
    return new FormularioDePerfil({
      altura: ciclista?.alturaCm != null ? String(ciclista.alturaCm) : "",
      experiencia: ciclista?.experiencia ?? "",
      atividade: ciclista?.atividade ?? "",
    });
  }

  /**
   * Soma `passo` centímetros à altura do campo e devolve o texto novo, sempre dentro da faixa
   * aceita. Campo vazio ou com texto parte de 170 cm.
   */
  static ajustarAltura(texto: string, passo: number): string {
    const atual = /^\d+$/.test(texto.trim()) ? Number(texto.trim()) : ALTURA_INICIAL_CM - passo;
    return String(Math.min(ALTURA_MAX_CM, Math.max(ALTURA_MIN_CM, atual + passo)));
  }

  // A API devolve os erros de campo com os nomes do contrato; o formulário usa "altura".
  static errosDaApi(detalhes: Record<string, string>): ErrosPerfil {
    return {
      altura: detalhes.alturaCm,
      experiencia: detalhes.experiencia,
      atividade: detalhes.atividade,
      corpo: detalhes.corpo,
    };
  }

  get dados(): FormularioPerfil {
    return { ...this.#dados };
  }

  validar(): ErrosPerfil {
    const form = this.#dados;
    const erros: ErrosPerfil = {};
    const altura = form.altura.trim();
    if (altura !== "") {
      if (!/^\d+$/.test(altura) || !RegrasDoCiclista.alturaValida(Number(altura))) {
        erros.altura = `Informe a altura em centímetros, de ${ALTURA_MIN_CM} a ${ALTURA_MAX_CM}.`;
      }
    }
    if (form.experiencia !== "" && !RegrasDoCiclista.ehExperiencia(form.experiencia)) {
      erros.experiencia = "Escolha uma das opções.";
    }
    if (form.atividade !== "" && !RegrasDoCiclista.ehAtividade(form.atividade)) {
      erros.atividade = "Escolha uma das opções.";
    }
    return erros;
  }

  // A rota substitui os três campos de uma vez e só aceita essas três chaves: campo vazio vai
  // como null (apaga o dado), nunca fica de fora.
  corpo(): PerfilCiclista {
    const form = this.#dados;
    const altura = form.altura.trim();
    return {
      alturaCm: altura === "" ? null : Number(altura),
      experiencia: RegrasDoCiclista.ehExperiencia(form.experiencia) ? form.experiencia : null,
      atividade: RegrasDoCiclista.ehAtividade(form.atividade) ? form.atividade : null,
    };
  }

  /** Quantos dos três dados do formulário estão preenchidos com um valor aceito (0 a 3). */
  dadosInformados(): number {
    const form = this.#dados;
    const altura = form.altura.trim();
    return [
      /^\d+$/.test(altura) && RegrasDoCiclista.alturaValida(Number(altura)),
      RegrasDoCiclista.ehExperiencia(form.experiencia),
      RegrasDoCiclista.ehAtividade(form.atividade),
    ].filter(Boolean).length;
  }

  /**
   * Devolve o formulário com um campo trocado. O valor pode ser o texto novo ou uma função que
   * recebe o texto ATUAL do campo: assim, vários toques seguidos nos botões − e + somam sobre o
   * valor mais recente e nenhum se perde, mesmo que a tela ainda não tenha redesenhado.
   */
  com(campo: keyof FormularioPerfil, valor: string | ((atual: string) => string)): FormularioDePerfil {
    const novo = typeof valor === "function" ? valor(this.#dados[campo]) : valor;
    return new FormularioDePerfil({ ...this.#dados, [campo]: novo });
  }
}

// Se a conta já tem os três dados do ciclista. Só tem método estático, então não se cria instância.
export class CompletudeDoPerfil {
  private constructor() {
    throw new Error("CompletudeDoPerfil só tem métodos estáticos.");
  }

  static estaCompleto(ciclista?: PerfilCiclista | null): boolean {
    return Boolean(ciclista && ciclista.alturaCm && ciclista.experiencia && ciclista.atividade);
  }
}

// As iniciais do nome para o avatar do perfil. Só tem método estático, então não se cria instância.
export class IniciaisDoNome {
  private constructor() {
    throw new Error("IniciaisDoNome só tem métodos estáticos.");
  }

  static de(nome: string): string {
    const partes = nome.trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return "?";
    const primeira = partes[0][0];
    const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
    return `${primeira}${ultima}`.toUpperCase();
  }
}
