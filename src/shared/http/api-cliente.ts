import { ArmazemDeSessao } from "../auth/sessao.ts";
import { TradutorDeErros } from "./tradutor-de-erros.ts";

export type ErrosPorCampo = Record<string, string>;

export type UsuarioAutenticado = {
  id: string;
  perfil: "CLIENTE" | "OPERADOR" | "ADMIN";
  nome: string;
  email: string;
};

export type ResultadoSessao = {
  token: string;
  tipo: "Bearer";
  expiraEm: string;
  usuario: UsuarioAutenticado;
};

export class ApiError extends Error {
  code: string;
  details?: ErrosPorCampo;
  /** Status HTTP da resposta (0 quando a requisição nem chegou ao servidor). */
  status: number;

  constructor(code: string, message: string, details?: ErrosPorCampo, status = 0) {
    super(message);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export type OpcoesAutenticado = {
  // Padrão: um 401 derruba a sessão e leva ao login. A troca de senha desliga isso, porque lá
  // o 401 também quer dizer "senha atual incorreta" e a pessoa deve continuar logada.
  sairSeNaoAutorizado?: boolean;
};

export type OpcoesDoClienteApi = {
  /** A função de rede. Padrão: o fetch global, lido a cada chamada. */
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
  armazem?: ArmazemDeSessao;
  tradutor?: TradutorDeErros;
  /** O que fazer quando a API recusa o token. Padrão: apaga a sessão e vai para o login. */
  aoNaoAutorizado?: () => void;
};

// Conversa com a API a partir do navegador. Rotas que exigem login mandam o token da sessão em
// Authorization. Tudo que depende do ambiente (rede, armazenamento do token, redirecionamento) entra
// pelo construtor, então os testes trocam por versões de mentira.
export class ClienteApi {
  /** O cliente do app: usa o fetch, o localStorage e o window de verdade. */
  static readonly padrao = new ClienteApi();

  readonly #fetcher: (url: string, init: RequestInit) => Promise<Response>;
  readonly #armazem: ArmazemDeSessao;
  readonly #tradutor: TradutorDeErros;
  readonly #aoNaoAutorizado: () => void;

  constructor(opcoes: OpcoesDoClienteApi = {}) {
    this.#fetcher = opcoes.fetcher ?? ((url, init) => fetch(url, init));
    this.#armazem = opcoes.armazem ?? ArmazemDeSessao.navegador;
    this.#tradutor = opcoes.tradutor ?? new TradutorDeErros();
    this.#aoNaoAutorizado = opcoes.aoNaoAutorizado ?? (() => this.#sessaoRecusada());
  }

  // POST sem login (cadastro e login).
  postJson<T>(url: string, corpo: unknown): Promise<T> {
    return this.#enviar<T>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
  }

  get<T>(url: string): Promise<T> {
    return this.#enviarAutenticado<T>(url, { headers: this.#cabecalhoAutenticado() });
  }

  put<T>(url: string, corpo: unknown): Promise<T> {
    return this.#enviarAutenticado<T>(url, this.#comCorpo("PUT", corpo));
  }

  patch<T>(url: string, corpo: unknown): Promise<T> {
    return this.#enviarAutenticado<T>(url, this.#comCorpo("PATCH", corpo));
  }

  post<T>(url: string, corpo: unknown = {}, opcoes?: OpcoesAutenticado): Promise<T> {
    return this.#enviarAutenticado<T>(url, this.#comCorpo("POST", corpo), opcoes);
  }

  #comCorpo(metodo: string, corpo: unknown): RequestInit {
    return {
      method: metodo,
      headers: { "Content-Type": "application/json", ...this.#cabecalhoAutenticado() },
      body: JSON.stringify(corpo),
    };
  }

  #cabecalhoAutenticado(): Record<string, string> {
    const token = this.#armazem.token();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async #enviar<T>(url: string, init: RequestInit): Promise<T> {
    let resposta: Response;
    try {
      resposta = await this.#fetcher(url, init);
    } catch {
      // fetch só rejeita quando a requisição nem chegou ao servidor (rede caída, offline).
      throw new ApiError("NETWORK_ERROR", TradutorDeErros.MENSAGEM_SEM_CONEXAO);
    }
    const json = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      const erro = json?.error ?? { code: "UNKNOWN", message: "Não foi possível completar a ação." };
      throw new ApiError(
        erro.code,
        this.#tradutor.traduzir(resposta.status, erro.code, erro.message),
        erro.details,
        resposta.status,
      );
    }

    // 204 (senha, altura, desativar) não tem corpo: sucesso sem dados.
    return (json?.data ?? undefined) as T;
  }

  async #enviarAutenticado<T>(url: string, init: RequestInit, opcoes: OpcoesAutenticado = {}): Promise<T> {
    try {
      return await this.#enviar<T>(url, init);
    } catch (erro) {
      if (erro instanceof ApiError && erro.code === "UNAUTHORIZED" && opcoes.sairSeNaoAutorizado !== false) {
        this.#aoNaoAutorizado();
      }
      throw erro;
    }
  }

  // Token recusado pela API (revogado, conta inativa ou expirado): apaga a sessão e leva para o
  // login, guardando a tela atual em ?next= para voltar depois de entrar de novo.
  #sessaoRecusada(): void {
    this.#armazem.limpar();
    const origem = window.location.pathname + window.location.search;
    const login = new URL("/login", window.location.origin);
    login.searchParams.set("next", origem);
    window.location.assign(login.href);
  }
}
