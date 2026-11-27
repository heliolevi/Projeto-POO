// Confere as variáveis de ambiente quando o servidor sobe (src/instrumentation.ts) e junta TODOS os
// problemas numa só mensagem em português, em vez de o app cair no primeiro pedido com um erro solto.
// Nunca escreve o valor de uma variável na mensagem: só o nome (o valor pode ser segredo).
//
// Orientação a objetos: cada variável tem uma REGRA (RegraDeVariavel, abstrata) e o
// ValidadorDoAmbiente só junta o que as regras dizem, sem saber quais são (polimorfismo, como o
// RecomendacaoService com os CriterioDeRecomendacao). Variável nova = uma regra nova (ou mais uma
// instância de uma regra que já existe) na lista REGRAS_DO_APP, sem mexer no validador.

export type VariaveisDoAmbiente = Readonly<Record<string, string | undefined>>;

/** Quando a variável é obrigatória. */
export type Exigencia = "sempre" | "em-producao" | "nunca";

export const SESSION_SECRET_MIN = 32;
export const HEALTH_DB_SECRET_MIN = 16;

// Valor de exemplo do .env.example: tem mais de 32 caracteres e passaria na checagem de tamanho,
// mas qualquer pessoa o conhece e poderia forjar tokens.
const SEGREDO_DE_EXEMPLO = "troque-por-um-valor-aleatorio";

const HOSTS_LOCAIS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Variável vazia ("NOME=" no .env) conta como ausente.
function lerVariavel(env: VariaveisDoAmbiente, nome: string): string | undefined {
  const valor = env[nome]?.trim();
  return valor ? valor : undefined;
}

type DadosDaRegra = {
  nome: string;
  exigencia: Exigencia;
  /** O que fazer quando a variável falta (entra depois de "NOME ausente."). */
  dicaSeAusente: string;
};

/**
 * Regra de UMA variável. A base decide o que fazer quando ela falta (conforme a exigência); cada
 * filha decide se o valor que está lá serve (conferirValor).
 */
export abstract class RegraDeVariavel {
  readonly #nome: string;
  readonly #exigencia: Exigencia;
  readonly #dicaSeAusente: string;

  protected constructor({ nome, exigencia, dicaSeAusente }: DadosDaRegra) {
    this.#nome = nome;
    this.#exigencia = exigencia;
    this.#dicaSeAusente = dicaSeAusente;
  }

  get nome(): string {
    return this.#nome;
  }

  protected get exigencia(): Exigencia {
    return this.#exigencia;
  }

  /** Mensagem do problema, ou null se está tudo certo. valor é undefined quando falta ou está vazia. */
  conferir(valor: string | undefined, producao: boolean): string | null {
    if (valor === undefined) {
      const obrigatoria =
        this.#exigencia === "sempre" || (this.#exigencia === "em-producao" && producao);
      return obrigatoria ? `${this.#nome} ausente. ${this.#dicaSeAusente}` : null;
    }
    return this.conferirValor(valor, producao);
  }

  protected abstract conferirValor(valor: string, producao: boolean): string | null;
}

/** Conexão com o Postgres (DATABASE_URL). */
export class UrlDoBanco extends RegraDeVariavel {
  constructor() {
    super({
      nome: "DATABASE_URL",
      exigencia: "sempre",
      dicaSeAusente: "Cole a conexão do Neon (usuário app_login, host com -pooler).",
    });
  }

  protected conferirValor(valor: string): string | null {
    return /^postgres(ql)?:\/\//.test(valor) ? null : `${this.nome} precisa começar com postgresql://.`;
  }
}

type DadosDoSegredo = DadosDaRegra & {
  minimo: number;
  /** Começo do valor do .env.example: qualquer um que comece assim é recusado. */
  valorDeExemplo?: string;
};

/** Segredo (SESSION_SECRET, HEALTH_DB_SECRET): tamanho mínimo e, se houver, valor de exemplo recusado. */
export class SegredoComTamanhoMinimo extends RegraDeVariavel {
  readonly #minimo: number;
  readonly #valorDeExemplo: string | undefined;

  constructor({ minimo, valorDeExemplo, ...dados }: DadosDoSegredo) {
    super(dados);
    this.#minimo = minimo;
    this.#valorDeExemplo = valorDeExemplo;
  }

  protected conferirValor(valor: string): string | null {
    if (valor.length < this.#minimo) {
      const saida = this.exigencia === "nunca" ? " (ou fique em branco para desligar)" : "";
      return `${this.nome} precisa ter ao menos ${this.#minimo} caracteres${saida}.`;
    }
    if (this.#valorDeExemplo !== undefined && valor.startsWith(this.#valorDeExemplo)) {
      return `${this.nome} ainda está com o valor de exemplo. Gere um valor aleatório.`;
    }
    return null;
  }
}

/**
 * Endereço público do app (APP_URL). Opcional: nenhuma rota lê essa variável ainda, então exigir faria o
 * deploy cair por algo sem uso. Se vier, precisa ser só o endereço (http ou https, sem barra no fim,
 * caminho nem parâmetros) e https em produção (exceto o computador local).
 */
export class UrlDoApp extends RegraDeVariavel {
  constructor() {
    super({
      nome: "APP_URL",
      exigencia: "nunca",
      dicaSeAusente: "Informe o endereço público do app, como https://bike-ilha-club.vercel.app.",
    });
  }

  protected conferirValor(valor: string, producao: boolean): string | null {
    let url: URL;
    try {
      url = new URL(valor);
    } catch {
      return `${this.nome} não é um endereço válido. Use algo como https://bike-ilha-club.vercel.app.`;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return `${this.nome} precisa começar com http:// ou https://.`;
    }
    if (valor.endsWith("/") || url.pathname !== "/" || url.search !== "" || url.hash !== "") {
      return `${this.nome} deve ser só o endereço, sem barra no fim, caminho ou parâmetros. Use algo como https://bike-ilha-club.vercel.app.`;
    }
    if (producao && url.protocol !== "https:" && !HOSTS_LOCAIS.has(url.hostname)) {
      return `${this.nome} precisa usar https:// em produção.`;
    }
    return null;
  }
}

type DadosDeUmDosValores = DadosDaRegra & { valores: readonly string[] };

/** Variável que só aceita alguns valores (nenhuma do app usa ainda). A mensagem nunca repete o valor recebido. */
export class UmDosValores extends RegraDeVariavel {
  readonly #valores: readonly string[];

  constructor({ valores, ...dados }: DadosDeUmDosValores) {
    super(dados);
    this.#valores = [...valores];
  }

  protected conferirValor(valor: string): string | null {
    if (this.#valores.includes(valor)) return null;
    return `${this.nome} tem um valor que não existe. Valores aceitos: ${this.#valores.join(", ")}.`;
  }
}

type DadosDaChave = DadosDaRegra & { prefixos: readonly string[] };

/**
 * Chave de um serviço de fora (as da Stripe): precisa começar por um dos prefixos conhecidos, o que
 * pega o valor colado errado ou de outra conta. A mensagem nunca repete o valor recebido.
 */
export class ChaveComPrefixo extends RegraDeVariavel {
  readonly #prefixos: readonly string[];

  constructor({ prefixos, ...dados }: DadosDaChave) {
    super(dados);
    this.#prefixos = [...prefixos];
  }

  protected conferirValor(valor: string): string | null {
    if (this.#prefixos.some((prefixo) => valor.startsWith(prefixo))) return null;
    return `${this.nome} tem um formato inesperado. Ela começa com ${this.#prefixos.join(" ou ")}.`;
  }
}

/** Junta os problemas de todas as regras, sem saber quais são. */
export class ValidadorDoAmbiente {
  readonly #regras: readonly RegraDeVariavel[];

  constructor(regras: readonly RegraDeVariavel[]) {
    this.#regras = [...regras];
  }

  /** Lista de problemas (vazia se está tudo certo), na ordem das regras. */
  validar(env: VariaveisDoAmbiente, producao: boolean): string[] {
    const problemas: string[] = [];
    for (const regra of this.#regras) {
      const problema = regra.conferir(lerVariavel(env, regra.nome), producao);
      if (problema) problemas.push(problema);
    }
    return problemas;
  }
}

/** A regra do SESSION_SECRET. O token usa a mesma, para não ter duas definições do que é um segredo bom. */
export const REGRA_DO_SEGREDO_DE_SESSAO = new SegredoComTamanhoMinimo({
  nome: "SESSION_SECRET",
  exigencia: "sempre",
  dicaSeAusente: "Gere um valor aleatório (o comando está no .env.example).",
  minimo: SESSION_SECRET_MIN,
  valorDeExemplo: SEGREDO_DE_EXEMPLO,
});

// Em produção, DATABASE_URL, SESSION_SECRET e as duas chaves da Stripe são obrigatórias (sem elas o
// pagamento responderia 502 com o app "saudável"). Em desenvolvimento só as duas primeiras.
export const REGRAS_DO_APP: readonly RegraDeVariavel[] = [
  new UrlDoBanco(),
  REGRA_DO_SEGREDO_DE_SESSAO,
  new SegredoComTamanhoMinimo({
    nome: "HEALTH_DB_SECRET",
    exigencia: "nunca",
    dicaSeAusente: "",
    minimo: HEALTH_DB_SECRET_MIN,
  }),
  new UrlDoApp(),
  new ChaveComPrefixo({
    nome: "STRIPE_SECRET_KEY",
    exigencia: "em-producao",
    dicaSeAusente: "Cole a chave secreta da Stripe (sk_test_... no teste, sk_live_... em produção).",
    prefixos: ["sk_test_", "sk_live_", "rk_test_", "rk_live_"],
  }),
  new ChaveComPrefixo({
    nome: "STRIPE_WEBHOOK_SECRET",
    exigencia: "em-producao",
    dicaSeAusente: "Cole o segredo do webhook da Stripe (whsec_...).",
    prefixos: ["whsec_"],
  }),
];

const validadorDoApp = new ValidadorDoAmbiente(REGRAS_DO_APP);

/** Lista de problemas das variáveis (vazia se está tudo certo). */
export function validarAmbiente(env: VariaveisDoAmbiente, producao: boolean): string[] {
  return validadorDoApp.validar(env, producao);
}

/** Lança um erro com todos os problemas, se houver. Chamado uma vez, quando o servidor sobe. */
export function garantirAmbiente(
  env: VariaveisDoAmbiente = process.env,
  producao: boolean = env.NODE_ENV === "production",
): void {
  const problemas = validarAmbiente(env, producao);
  if (problemas.length === 0) return;
  throw new Error(
    [
      "Configuração do ambiente inválida. Corrija as variáveis abaixo (modelo em .env.example, passo a passo em docs/ambiente-local.md):",
      ...problemas.map((problema) => ` - ${problema}`),
    ].join("\n"),
  );
}
