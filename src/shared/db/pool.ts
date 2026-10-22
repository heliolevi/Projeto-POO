import { Pool, type QueryResult, type QueryResultRow } from "pg";
import { requireEnv } from "@/shared/config/env";

// Um único pool por processo. Em desenvolvimento o hot reload recarrega os módulos e
// criaria um pool novo a cada alteração; guardar no globalThis evita esgotar conexões.
const global_ = globalThis as typeof globalThis & { __bikeIlhaPool?: Pool };

function criarPool(): Pool {
  // DATABASE_URL é a conexão com pooler (host "-pooler" no Neon), própria para o app.
  // As migrations usam DATABASE_URL_UNPOOLED (ver db/README.md).
  const pool = new Pool({
    connectionString: requireEnv("DATABASE_URL"),
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

// O pool só é criado no primeiro uso, então o build não precisa de banco nem de variável.
export function getPool(): Pool {
  global_.__bikeIlhaPool ??= criarPool();
  return global_.__bikeIlhaPool;
}

export function query<T extends QueryResultRow = QueryResultRow>(
  texto: string,
  valores?: unknown[],
): Promise<QueryResult<T>> {
  return getPool().query<T>(texto, valores);
}
