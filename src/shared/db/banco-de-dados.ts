import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { Ambiente } from "../config/ambiente.ts";
import type { ExecutorDeConsultas } from "./executor-de-consultas.ts";
import { TransacaoComSessao, type SessaoBanco } from "./sessao.ts";

// Em desenvolvimento o hot reload recarrega os módulos e criaria um pool novo a cada alteração;
// guardar no globalThis evita esgotar conexões.
const global_ = globalThis as typeof globalThis & { __bikeIlhaPool?: Pool };

// A conexão com o PostgreSQL. O pool só é criado no primeiro uso (a fábrica entra pelo construtor),
// então o build e os testes que só importam a classe não precisam de banco nem de variável.
export class BancoDeDados implements ExecutorDeConsultas {
  // O do app: um único por processo, com a DATABASE_URL.
  static readonly padrao = new BancoDeDados(() => (global_.__bikeIlhaPool ??= BancoDeDados.#criarPool(Ambiente.padrao)));

  readonly #fabricaDePool: () => Pool;
  #pool: Pool | undefined;

  constructor(fabricaDePool: () => Pool) {
    this.#fabricaDePool = fabricaDePool;
  }

  static #criarPool(ambiente: Ambiente): Pool {
    // DATABASE_URL é a conexão com pooler (host "-pooler" no Neon), própria para o app.
    // As migrations usam DATABASE_URL_UNPOOLED (ver db/README.md).
    const pool = new Pool({
      connectionString: ambiente.exigir("DATABASE_URL"),
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    // Sem este handler, um erro numa conexão ociosa derruba o processo.
    pool.on("error", (erro) => {
      console.error("Erro numa conexão ociosa do banco:", erro.message);
    });
    return pool;
  }

  #obterPool(): Pool {
    this.#pool ??= this.#fabricaDePool();
    return this.#pool;
  }

  consultar<T extends QueryResultRow = QueryResultRow>(texto: string, valores?: unknown[]): Promise<QueryResult<T>> {
    return this.#obterPool().query<T>(texto, valores);
  }

  // Abre uma transação, declara a sessão (para a segurança por linha) e executa fn.
  //   const sessao = await exigirSessao(request);
  //   const reservas = await banco.comSessao(sessao, (c) => c.query("SELECT ..."));
  comSessao<T>(sessao: SessaoBanco, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    return new TransacaoComSessao<PoolClient>(() => this.#obterPool().connect()).executar(sessao, fn);
  }
}
