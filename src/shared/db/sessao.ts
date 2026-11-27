// Quem está fazendo a consulta, no formato que as políticas de row-level security leem
// (sessao_perfil() e sessao_usuario_id(), migration 0004; ver docs/modelo-de-dados.md).
// As políticas só valem se o app conectar com um papel sem BYPASSRLS (app_login, do grupo
// app_backend criado na migration 0003).
export const PERFIS_SESSAO = ["CLIENTE", "OPERADOR", "ADMIN"] as const;
export type PerfilSessao = (typeof PERFIS_SESSAO)[number];

// Usuário logado: tem o mesmo formato da sessão que o exigirSessao do módulo contas devolve,
// então a rota repassa a sessão direto. Visitante (sem login): perfil e usuário nulos, e só as
// políticas públicas (catálogo, pontos ativos) deixam ver alguma coisa.
export type SessaoBanco =
  | { perfil: PerfilSessao; usuarioId: string }
  | { perfil: null; usuarioId: null };

export const VISITANTE: SessaoBanco = { perfil: null, usuarioId: null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ClienteTransacao = {
  query(sql: string, valores?: unknown[]): Promise<unknown>;
  release(): void;
};

// Executa um trecho de código dentro de uma transação com a sessão declarada. O set_config com
// "true" vale só dentro da transação, então a sessão não vaza para a próxima requisição que
// reaproveitar a conexão. A forma de obter a conexão entra pelo construtor (o BancoDeDados passa a
// do pool; os testes passam uma de mentira).
export class TransacaoComSessao<C extends ClienteTransacao> {
  readonly #conectar: () => Promise<C>;

  constructor(conectar: () => Promise<C>) {
    this.#conectar = conectar;
  }

  static #validar(sessao: SessaoBanco): void {
    if (sessao.perfil === null) {
      if (sessao.usuarioId !== null) throw new Error("Visitante não tem usuarioId.");
      return;
    }
    if (!PERFIS_SESSAO.includes(sessao.perfil)) {
      throw new Error(`Perfil de sessão desconhecido: ${String(sessao.perfil)}`);
    }
    if (typeof sessao.usuarioId !== "string" || !UUID.test(sessao.usuarioId)) {
      throw new Error("usuarioId da sessão precisa ser um UUID.");
    }
  }

  // Sessão inválida é recusada antes de pegar uma conexão. Se fn falha: ROLLBACK, a conexão é
  // devolvida e o erro original sobe.
  async executar<T>(sessao: SessaoBanco, fn: (client: C) => Promise<T>): Promise<T> {
    TransacaoComSessao.#validar(sessao);
    const client = await this.#conectar();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.perfil', $1, true), set_config('app.usuario_id', $2, true)",
        [sessao.perfil ?? "", sessao.usuarioId ?? ""],
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
}
