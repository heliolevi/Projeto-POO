import type { PoolClient } from "pg";
import { BancoDeDados } from "../../../shared/db/banco-de-dados.ts";
import type {
  ExecutorDoPainel,
  OperacoesDoPainel,
  SessaoDaEquipe,
} from "../application/painel-de-reservas.ts";
import type { FiltroDoPainel } from "../domain/filtro-do-painel.ts";
import { ReservaDoPainel } from "../domain/reserva-do-painel.ts";

// O painel mostra o dia (ou os aluguéis em andamento): passar disto quer dizer filtro frouxo demais.
// O limite protege o banco e o navegador; o contrato não prevê paginação no MVP.
export const LIMITE_DO_PAINEL = 1000;

// reserva_equipe (migration 0006) deixa a equipe ler todas as reservas, e bicicleta_equipe, todas as
// bicicletas; usuario e tipo_bicicleta não têm segurança por linha. O código da bicicleta só sai por
// aqui, nunca pela view do cliente. Datas e filtros vão como parâmetros ($1...), nunca no texto SQL.
const LISTAR = `
  SELECT r.id,
         r.codigo,
         r.status,
         u.id   AS cliente_id,
         u.nome AS cliente_nome,
         t.id   AS tipo_id,
         t.nome AS tipo_nome,
         b.id   AS bicicleta_id,
         b.codigo AS bicicleta_codigo,
         lower(r.periodo) AS inicio,
         upper(r.periodo) AS fim,
         r.valor_aluguel_centavos
  FROM reserva r
  JOIN usuario u ON u.id = r.cliente_id
  JOIN bicicleta b ON b.id = r.bicicleta_id
  JOIN tipo_bicicleta t ON t.id = b.tipo_id
  WHERE ($1::status_reserva IS NULL OR r.status = $1::status_reserva)
    AND ($2::timestamptz IS NULL OR (lower(r.periodo) >= $2::timestamptz AND lower(r.periodo) < $3::timestamptz))
  ORDER BY lower(r.periodo), r.codigo
  LIMIT ${LIMITE_DO_PAINEL}
`;

type LinhaDoPainel = {
  id: string;
  codigo: string;
  status: ReservaDoPainel["status"];
  cliente_id: string;
  cliente_nome: string;
  tipo_id: string;
  tipo_nome: string;
  bicicleta_id: string;
  bicicleta_codigo: string;
  inicio: Date;
  fim: Date;
  valor_aluguel_centavos: number;
};

// As operações do painel sobre uma conexão que já está dentro da transação com a sessão declarada.
export class OperacoesDoPainelNoBanco implements OperacoesDoPainel {
  readonly #client: Pick<PoolClient, "query">;

  constructor(client: Pick<PoolClient, "query">) {
    this.#client = client;
  }

  async expirarVencidas(): Promise<void> {
    await this.#client.query("SELECT expirar_reservas_vencidas()");
  }

  async listar(filtro: FiltroDoPainel): Promise<ReservaDoPainel[]> {
    const { rows } = await this.#client.query<LinhaDoPainel>(LISTAR, [
      filtro.status,
      filtro.inicioDoDia?.toISOString() ?? null,
      filtro.fimDoDia?.toISOString() ?? null,
    ]);
    return rows.map(
      (l) =>
        new ReservaDoPainel({
          id: l.id,
          codigo: l.codigo,
          status: l.status,
          clienteId: l.cliente_id,
          clienteNome: l.cliente_nome,
          tipoId: l.tipo_id,
          tipoNome: l.tipo_nome,
          bicicletaId: l.bicicleta_id,
          bicicletaCodigo: l.bicicleta_codigo,
          inicio: l.inicio,
          fim: l.fim,
          valorAluguelCentavos: l.valor_aluguel_centavos,
        }),
    );
  }
}

// Abre a transação no banco do app, com a sessão da equipe, e entrega as operações do painel.
export class RepositorioDoPainel implements ExecutorDoPainel {
  /** O do app. */
  static readonly padrao = new RepositorioDoPainel(BancoDeDados.padrao);

  readonly #banco: Pick<BancoDeDados, "comSessao">;

  constructor(banco: Pick<BancoDeDados, "comSessao"> = BancoDeDados.padrao) {
    this.#banco = banco;
  }

  executar<T>(sessao: SessaoDaEquipe, fn: (operacoes: OperacoesDoPainel) => Promise<T>): Promise<T> {
    return this.#banco.comSessao(sessao, (client) => fn(new OperacoesDoPainelNoBanco(client)));
  }
}
