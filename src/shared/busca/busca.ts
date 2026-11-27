import { RegrasDoCiclista, type Atividade } from "../dominio/ciclista.ts";
import { FormatadorDeData } from "../format/formatador-de-data.ts";

// Resultado de GET /api/recomendacao (contrato, rota 11).
export type Recomendacao = {
  tipoId: string;
  nome: string;
  descricao: string;
  pontos: number;
  motivos: string[];
  valorAluguelCentavos: number;
  valorCaucaoCentavos: number;
  unidadesLivres: number;
};

export type RespostaRecomendacao = {
  periodo: { inicio: string; fim: string; horas: number };
  resultados: Recomendacao[];
};

export type FormularioBusca = {
  data: string;
  hora: string;
  /** Duração em minutos, como texto (valor do Select). */
  duracao: string;
  /** Vazio = usar a atividade do perfil do cliente. */
  atividade: string;
};

export type ErrosBusca = Partial<Record<keyof FormularioBusca, string>>;

// Períodos aceitos pela API: de 1 hora a 7 dias.
export const DURACOES = [
  { valor: "60", rotulo: "1 hora" },
  { valor: "120", rotulo: "2 horas" },
  { valor: "180", rotulo: "3 horas" },
  { valor: "240", rotulo: "4 horas" },
  { valor: "360", rotulo: "6 horas" },
  { valor: "480", rotulo: "8 horas" },
  { valor: "1440", rotulo: "1 dia" },
  { valor: "2880", rotulo: "2 dias" },
  { valor: "4320", rotulo: "3 dias" },
  { valor: "10080", rotulo: "7 dias" },
] as const;

const VALORES_DE_DURACAO: readonly string[] = DURACOES.map((d) => d.valor);

// O formulário da busca com as regras em cima dos dados: valida, calcula o período e monta a query.
// É imutável (guarda uma cópia dos dados e não oferece como mudá-los); a tela troca de formulário
// criando outro com os dados novos.
export class FormularioDeBusca {
  #dados: Readonly<FormularioBusca>;

  constructor(dados: FormularioBusca) {
    this.#dados = Object.freeze({ ...dados });
  }

  get dados(): FormularioBusca {
    return { ...this.#dados };
  }

  validar(agora: Date = new Date()): ErrosBusca {
    const form = this.#dados;
    const erros: ErrosBusca = {};
    if (!form.data) erros.data = "Escolha o dia da retirada.";
    if (!form.hora) erros.hora = "Escolha o horário de início.";
    if (!VALORES_DE_DURACAO.includes(form.duracao)) erros.duracao = "Escolha por quanto tempo.";
    if (form.atividade !== "" && !RegrasDoCiclista.ehAtividade(form.atividade)) {
      erros.atividade = "Escolha uma das opções.";
    }

    if (!erros.data && !erros.hora) {
      const iso = this.#inicioEmIso();
      if (!iso) erros.data = "Essa data ou hora não existe.";
      else if (new Date(iso).getTime() <= agora.getTime()) {
        erros.data = "A retirada precisa ser no futuro.";
      }
    }
    return erros;
  }

  /** Fim do período: início + duração, em ISO (UTC). Só use depois de `validar` sem erros. */
  periodo(): { inicio: string; fim: string } {
    const inicio = FormatadorDeData.saoLuis.paraIso(this.#dados.data, this.#dados.hora);
    const fim = new Date(new Date(inicio).getTime() + Number(this.#dados.duracao) * 60_000);
    return { inicio, fim: fim.toISOString() };
  }

  /** Query da rota 11. A atividade só vai se o cliente escolheu uma; senão vale a do perfil. */
  consulta(): string {
    const { inicio, fim } = this.periodo();
    const parametros = new URLSearchParams({ inicio, fim });
    if (RegrasDoCiclista.ehAtividade(this.#dados.atividade)) {
      parametros.set("atividade", this.#dados.atividade as Atividade);
    }
    return parametros.toString();
  }

  #inicioEmIso(): string | null {
    try {
      return FormatadorDeData.saoLuis.paraIso(this.#dados.data, this.#dados.hora);
    } catch {
      return null;
    }
  }
}

export type Aderencia = { rotulo: string; variant: "sucesso" | "info" | "neutro" };

// Texto do selo de adequação a partir dos pontos (0 a 100) da recomendação. Só tem método
// estático (não guarda estado), então não se cria instância.
export class AderenciaDaRecomendacao {
  private constructor() {
    throw new Error("AderenciaDaRecomendacao só tem métodos estáticos.");
  }

  static dosPontos(pontos: number): Aderencia {
    if (pontos >= 80) return { rotulo: "Muito indicada", variant: "sucesso" };
    if (pontos >= 50) return { rotulo: "Indicada", variant: "info" };
    return { rotulo: "Possível", variant: "neutro" };
  }
}
