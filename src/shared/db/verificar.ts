import { query } from "./pool";

export type StatusBanco = {
  banco: string;
  // versão da extensão PostGIS, ou null se ela não estiver habilitada neste banco
  postgis: string | null;
  // migrations aplicadas (null se a tabela de controle ainda não existe)
  migrations: number | null;
};

export async function verificarBanco(): Promise<StatusBanco> {
  const { rows } = await query<{
    banco: string;
    postgis: string | null;
    controle: string | null;
  }>(`
    SELECT current_database() AS banco,
           (SELECT extversion FROM pg_extension WHERE extname = 'postgis') AS postgis,
           to_regclass('public.schema_migrations')::text AS controle
  `);
  const linha = rows[0];

  let migrations: number | null = null;
  if (linha.controle) {
    const { rows: contagem } = await query<{ total: number }>(
      "SELECT count(*)::int AS total FROM schema_migrations",
    );
    migrations = contagem[0].total;
  }

  return { banco: linha.banco, postgis: linha.postgis, migrations };
}
