import type { ExecutorDeConsultas } from "./executor-de-consultas.ts";

export type StatusBanco = {
  banco: string;
  // versão da extensão PostGIS, ou null se ela não estiver habilitada neste banco
  postgis: string | null;
  // migrations aplicadas (null se a tabela de controle ainda não existe)
  migrations: number | null;
};

// Confere se o banco responde e o que ele tem (usada por GET /api/health/db).
export class VerificadorDoBanco {
  readonly #banco: ExecutorDeConsultas;

  constructor(banco: ExecutorDeConsultas) {
    this.#banco = banco;
  }

  async verificar(): Promise<StatusBanco> {
    const { rows } = await this.#banco.consultar(`
      SELECT current_database() AS banco,
             (SELECT extversion FROM pg_extension WHERE extname = 'postgis') AS postgis,
             to_regclass('public.schema_migrations')::text AS controle
    `);
    const linha = rows[0] as { banco: string; postgis: string | null; controle: string | null };

    let migrations: number | null = null;
    if (linha.controle) {
      const { rows: contagem } = await this.#banco.consultar("SELECT count(*)::int AS total FROM schema_migrations");
      migrations = Number((contagem[0] as { total: number }).total);
    }

    return { banco: linha.banco, postgis: linha.postgis, migrations };
  }
}
