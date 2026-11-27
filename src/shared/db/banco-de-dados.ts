import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { Ambiente } from "../config/ambiente.ts";
import type { ExecutorDeConsultas } from "./executor-de-consultas.ts";
import { TransacaoComSessao, type SessaoBanco } from "./sessao.ts";

// Em desenvolvimento o hot reload recarrega os módulos e criaria um pool novo a cada alteração;
// guardar no globalThis evita esgotar conexões.
// O global guarda a PROMESSA do pool: a checagem e a atribuição acontecem no mesmo passo, antes de
// qualquer await. Guardar o pool já pronto deixava uma janela (durante o import de "pg") em que duas
// cópias do módulo criavam um pool cada, e o primeiro ficava órfão segurando conexões.
const global_ = globalThis as typeof globalThis & { __bikeIlhaPool?: Promise<Pool> };

// A conexão com o PostgreSQL. O pool só é criado no primeiro uso (a fábrica entra pelo construtor), e
// o pacote `pg` só é carregado nesse momento: quem apenas importa a classe (o build, os testes e os
// scripts de banco que usam as operações com uma conexão própria) não precisa de banco, de variável
// nem do pacote instalado.
export class BancoDeDados implements ExecutorDeConsultas {
  // O do app: um único por processo, com a DATABASE_URL.
  static readonly padrao = new BancoDeDados(() => BancoDeDados.#poolCompartilhado());

  readonly #fabricaDePool: () => Pool | Promise<Pool>;
  #pool: Promise<Pool> | undefined;

  constructor(fabricaDePool: () => Pool | Promise<Pool>) {
    this.#fabricaDePool = fabricaDePool;
  }

  static #poolCompartilhado(): Promise<Pool> {
    if (!global_.__bikeIlhaPool) {
      const criacao = BancoDeDados.#criarPool(Ambiente.padrao);
      global_.__bikeIlhaPool = criacao;
      // Se a criação falhar (variável ausente), a falha não fica guardada: a próxima consulta tenta de novo.
      criacao.catch(() => {
        if (global_.__bikeIlhaPool === criacao) delete global_.__bikeIlhaPool;
      });
    }
    return global_.__bikeIlhaPool;
  }

  static async #criarPool(ambiente: Ambiente): Promise<Pool> {
    const pg = await import("pg");
    const PoolDoPg = pg.Pool ?? pg.default.Pool;
    // DATABASE_URL é a conexão com pooler (host "-pooler" no Neon), própria para o app.
    // As migrations usam DATABASE_URL_UNPOOLED (ver db/README.md).
    const pool = new PoolDoPg({
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

  // Uma criação só, mesmo com várias consultas chegando juntas. Se a criação falhar (variável ausente,
  // por exemplo), a falha não fica guardada: a próxima consulta tenta de novo.
  #obterPool(): Promise<Pool> {
    if (!this.#pool) {
      const criacao = Promise.resolve()
        .then(() => this.#fabricaDePool())
        .catch((erro: unknown) => {
          if (this.#pool === criacao) this.#pool = undefined;
          throw erro;
        });
      this.#pool = criacao;
    }
    return this.#pool;
  }

  async consultar<T extends QueryResultRow = QueryResultRow>(texto: string, valores?: unknown[]): Promise<QueryResult<T>> {
    return (await this.#obterPool()).query<T>(texto, valores);
  }

  // Abre uma transação, declara a sessão (para a segurança por linha) e executa fn.
  //   const sessao = await exigirSessao(request);
  //   const reservas = await banco.comSessao(sessao, (c) => c.query("SELECT ..."));
  comSessao<T>(sessao: SessaoBanco, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    return new TransacaoComSessao<PoolClient>(async () => (await this.#obterPool()).connect()).executar(sessao, fn);
  }
}
