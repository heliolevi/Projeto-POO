import { EmpresaDaLocadora } from "./empresa-da-locadora";
import {
  EmpresaCarregada,
  EmpresaIndisponivel,
  EmpresaSemCadastro,
  type ResultadoDaEmpresa,
} from "./resultado-da-empresa";

/** O que o buscador precisa de uma função `fetch`; nos testes entra uma de mentira. */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type OpcoesDoBuscador = { fetcher?: Fetcher; tempoLimiteMs?: number };

const TEMPO_LIMITE_PADRAO_MS = 10_000;

// Busca GET /api/empresa (rota pública, então não envia o token). Nunca lança: 404 vira
// EmpresaSemCadastro; rede caída, status de erro, corpo que não é JSON, formato errado e resposta
// que não chega no tempo viram EmpresaIndisponivel. O fetch entra pelo construtor.
export class BuscadorDeEmpresa {
  readonly #fetcher: Fetcher;
  readonly #tempoLimiteMs: number;

  constructor(opcoes: OpcoesDoBuscador = {}) {
    this.#fetcher = opcoes.fetcher ?? ((url, init) => fetch(url, init));
    this.#tempoLimiteMs = opcoes.tempoLimiteMs ?? TEMPO_LIMITE_PADRAO_MS;
  }

  async buscar(): Promise<ResultadoDaEmpresa> {
    const controle = new AbortController();
    let relogio: ReturnType<typeof setTimeout> | undefined;

    const estouro = new Promise<ResultadoDaEmpresa>((resolver) => {
      relogio = setTimeout(() => {
        controle.abort();
        resolver(new EmpresaIndisponivel());
      }, this.#tempoLimiteMs);
    });

    try {
      return await Promise.race([this.#carregar(controle.signal), estouro]);
    } finally {
      clearTimeout(relogio);
    }
  }

  async #carregar(sinal: AbortSignal): Promise<ResultadoDaEmpresa> {
    try {
      const resposta = await this.#fetcher("/api/empresa", {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: sinal,
      });
      if (resposta.status === 404) return new EmpresaSemCadastro();
      if (!resposta.ok) return new EmpresaIndisponivel();
      const empresa = EmpresaDaLocadora.deResposta(await resposta.json());
      return empresa ? new EmpresaCarregada(empresa) : new EmpresaIndisponivel();
    } catch {
      return new EmpresaIndisponivel();
    }
  }
}
