import type { PoolClient } from "pg";

// Quem está fazendo a consulta, no formato que as políticas de row-level security leem
// (ver docs/modelo-de-dados.md). As políticas só valem se o app conectar com um papel sem
// BYPASSRLS (app_backend, criado na migration 0003).
const PERFIS = ["CLIENTE", "OPERADOR", "GERENTE_LOCADORA", "ADMIN_PLATAFORMA"] as const;
export type PerfilSessao = (typeof PERFIS)[number];

export type SessaoBanco = {
  perfil: PerfilSessao;
  // obrigatório para OPERADOR e GERENTE_LOCADORA; os demais perfis não têm locadora
  locadoraId?: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ClienteTransacao = {
  query(sql: string, valores?: unknown[]): Promise<unknown>;
  release(): void;
};

function validar(sessao: SessaoBanco): void {
  if (!PERFIS.includes(sessao.perfil)) {
    throw new Error(`Perfil de sessão desconhecido: ${String(sessao.perfil)}`);
  }
  if (sessao.locadoraId != null && !UUID.test(sessao.locadoraId)) {
    throw new Error("locadoraId da sessão precisa ser um UUID.");
  }
  const equipe = sessao.perfil === "OPERADOR" || sessao.perfil === "GERENTE_LOCADORA";
  if (equipe && sessao.locadoraId == null) {
    throw new Error(`O perfil ${sessao.perfil} precisa de locadoraId.`);
  }
  if (!equipe && sessao.locadoraId != null) {
    throw new Error(`O perfil ${sessao.perfil} não tem locadora.`);
  }
}

// Abre uma transação, declara a sessão e executa fn. O set_config com "true" vale só dentro
// da transação, então a sessão não vaza para a próxima requisição que reaproveitar a conexão.
export async function comSessaoEm<T, C extends ClienteTransacao>(
  conectar: () => Promise<C>,
  sessao: SessaoBanco,
  fn: (client: C) => Promise<T>,
): Promise<T> {
  validar(sessao);
  const client = await conectar();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.perfil', $1, true), set_config('app.locadora_id', $2, true)",
      [sessao.perfil, sessao.locadoraId ?? ""],
    );
    const resultado = await fn(client);
    await client.query("COMMIT");
    return resultado;
  } catch (erro) {
    await client.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    client.release();
  }
}

// Uso: const pontos = await comSessao({ perfil: "GERENTE_LOCADORA", locadoraId }, (c) =>
//        c.query("SELECT * FROM ponto"));
export async function comSessao<T>(
  sessao: SessaoBanco,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const { getPool } = await import("./pool");
  return comSessaoEm(() => getPool().connect(), sessao, fn);
}
