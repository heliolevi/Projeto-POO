import type { PoolClient } from "pg";
import { BancoDeDados } from "../../../shared/db/banco-de-dados.ts";
import { ConflictError } from "../../../shared/http/errors.ts";
import type { LinhaBicicleta, LinhaReserva, OperacoesOperacao, SessaoEquipe } from "../application/portas.ts";
import type { MovimentacaoParaPersistir } from "../domain/movimentacao.ts";

type LinhaView = {
  id: string;
  codigo: string;
  status: LinhaReserva["status"];
  tipo_id: string;
  tipo_nome: string;
  ponto_id: string;
  ponto_nome: string;
  ponto_endereco: string;
  inicio: Date;
  fim: Date;
  valor_aluguel_centavos: number;
  valor_caucao_centavos: number;
  criado_em: Date;
  pagamento_status: string | null;
  pagamento_metodo: string | null;
};

// A mesma leitura do módulo reservas: a view reserva_detalhada (migration 0011) monta o objeto
// reserva do contrato; a equipe enxerga todas as reservas.
const COLUNAS_VIEW = `
  id, codigo, status, tipo_id, tipo_nome, ponto_id, ponto_nome, ponto_endereco, inicio, fim,
  valor_aluguel_centavos, valor_caucao_centavos, criado_em, pagamento_status, pagamento_metodo`;

type LinhaDaUnidade = {
  id: string;
  codigo: string;
  numero_serie: string | null;
  tamanho_quadro: string | null;
  status: LinhaBicicleta["status"];
  observacoes: string | null;
  tipo_id: string;
  tipo_nome: string;
  ponto_id: string;
  ponto_nome: string;
};

// Operações das rotas 26 e 27 dentro da transação do comSessao (papel do app, sessão da equipe). A
// tabela movimentacao (migration 0010) só aceita a equipe; o cliente nunca escreve nela. A conexão
// da transação entra pelo construtor (a do pool, ou a de um teste).
export class OperacoesNoBanco implements OperacoesOperacao {
  readonly #client: Pick<PoolClient, "query">;

  constructor(client: Pick<PoolClient, "query">) {
    this.#client = client;
  }

  static #paraLinha(l: LinhaView): LinhaReserva {
    return {
      id: l.id,
      codigo: l.codigo,
      status: l.status,
      tipoId: l.tipo_id,
      tipoNome: l.tipo_nome,
      pontoId: l.ponto_id,
      pontoNome: l.ponto_nome,
      pontoEndereco: l.ponto_endereco,
      inicio: l.inicio,
      fim: l.fim,
      valorAluguelCentavos: l.valor_aluguel_centavos,
      valorCaucaoCentavos: l.valor_caucao_centavos,
      criadoEm: l.criado_em,
      pagamentoStatus: l.pagamento_status,
      pagamentoMetodo: l.pagamento_metodo,
    };
  }

  // Só a violação da unique movimentacao_reserva_tipo_unico conta como "já registrada".
  static #ehRepetida(erro: unknown): boolean {
    return (
      typeof erro === "object" &&
      erro !== null &&
      (erro as { code?: string }).code === "23505" &&
      (erro as { constraint?: string }).constraint === "movimentacao_reserva_tipo_unico"
    );
  }

  async expirarVencidas(): Promise<void> {
    await this.#client.query("SELECT expirar_reservas_vencidas()");
  }

  // FOR UPDATE na linha de reserva (a view não se trava) e, já com a trava, a leitura completa:
  // duas retiradas ao mesmo tempo, ou a retirada e um cancelamento, passam uma de cada vez.
  async travarReserva(id: string): Promise<LinhaReserva | null> {
    const { rowCount } = await this.#client.query("SELECT 1 FROM reserva WHERE id = $1 FOR UPDATE", [id]);
    if (rowCount === 0) return null;
    const { rows } = await this.#client.query<LinhaView>(
      `SELECT ${COLUNAS_VIEW} FROM reserva_detalhada WHERE id = $1`,
      [id],
    );
    return rows[0] ? OperacoesNoBanco.#paraLinha(rows[0]) : null;
  }

  // Trava a unidade DEPOIS da reserva (travarReserva vem antes, sempre): duas retiradas de reservas
  // seguidas da mesma bicicleta passam uma de cada vez, e a segunda vê a primeira EM_ANDAMENTO.
  async travarBicicletaDaReserva(reservaId: string): Promise<LinhaBicicleta | null> {
    const { rows } = await this.#client.query<LinhaDaUnidade>(
      `SELECT b.id, b.codigo, b.numero_serie, b.tamanho_quadro, b.status, b.observacoes,
              t.id AS tipo_id, t.nome AS tipo_nome, p.id AS ponto_id, p.nome AS ponto_nome
         FROM reserva r
         JOIN bicicleta b ON b.id = r.bicicleta_id
         JOIN tipo_bicicleta t ON t.id = b.tipo_id
         JOIN ponto p ON p.id = b.ponto_id
        WHERE r.id = $1
          FOR UPDATE OF b`,
      [reservaId],
    );
    const l = rows[0];
    if (!l) return null;
    return {
      id: l.id,
      codigo: l.codigo,
      tipo: { id: l.tipo_id, nome: l.tipo_nome },
      ponto: { id: l.ponto_id, nome: l.ponto_nome },
      numeroSerie: l.numero_serie,
      tamanhoQuadro: l.tamanho_quadro,
      status: l.status,
      observacoes: l.observacoes,
    };
  }

  async outraReservaEmAndamento(bicicletaId: string, reservaId: string): Promise<{ codigo: string } | null> {
    const { rows } = await this.#client.query<{ codigo: string }>(
      `SELECT codigo FROM reserva
        WHERE bicicleta_id = $1 AND id <> $2 AND status = 'EM_ANDAMENTO'
        ORDER BY lower(periodo)
        LIMIT 1`,
      [bicicletaId, reservaId],
    );
    return rows[0] ?? null;
  }

  // Cada tentativa tem o seu SAVEPOINT: a recusa por repetição (23505) desfaz só o INSERT, e a
  // transação segue de pé para o 409.
  async registrarMovimentacao(m: MovimentacaoParaPersistir): Promise<void> {
    await this.#client.query("SAVEPOINT tentativa_movimentacao");
    try {
      await this.#client.query(
        `INSERT INTO movimentacao (reserva_id, operador_id, tipo, checklist, observacoes, data_hora)
         VALUES ($1, $2, $3::tipo_movimentacao, $4::jsonb, $5, $6)`,
        [m.reservaId, m.operadorId, m.tipo, JSON.stringify(m.itens), m.observacoes, m.dataHora],
      );
      await this.#client.query("RELEASE SAVEPOINT tentativa_movimentacao");
    } catch (erro) {
      if (!OperacoesNoBanco.#ehRepetida(erro)) throw erro;
      await this.#client.query("ROLLBACK TO SAVEPOINT tentativa_movimentacao");
      const qual = m.tipo === "RETIRADA" ? "A retirada" : "A devolução";
      throw new ConflictError(`${qual} desta reserva já foi registrada.`);
    }
  }

  async mudarStatus(id: string, de: string, para: string): Promise<boolean> {
    const { rowCount } = await this.#client.query(
      `UPDATE reserva SET status = $3::status_reserva WHERE id = $1 AND status = $2::status_reserva`,
      [id, de, para],
    );
    return rowCount === 1;
  }

  async bicicletaDaReserva(id: string): Promise<{ id: string; codigo: string } | null> {
    const { rows } = await this.#client.query<{ id: string; codigo: string }>(
      `SELECT b.id, b.codigo FROM reserva r JOIN bicicleta b ON b.id = r.bicicleta_id WHERE r.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }
}

/** Quem abre a transação com a sessão da equipe (o BancoDeDados do app, ou um de mentira nos testes). */
export interface BancoComSessao {
  comSessao<T>(sessao: SessaoEquipe, fn: (client: PoolClient) => Promise<T>): Promise<T>;
}

// O repositório da operação: abre a transação com a sessão declarada (para a RLS) e entrega as
// operações dela. O banco entra pelo construtor.
export class RepositorioDeOperacao {
  /** O do app. */
  static readonly padrao = new RepositorioDeOperacao(BancoDeDados.padrao);

  readonly #banco: BancoComSessao;

  constructor(banco: BancoComSessao) {
    this.#banco = banco;
  }

  /** É a `TransacaoOperacao` que o OperacaoService recebe. */
  emTransacao<T>(sessao: SessaoEquipe, fn: (operacoes: OperacoesOperacao) => Promise<T>): Promise<T> {
    return this.#banco.comSessao(sessao, (client) => fn(new OperacoesNoBanco(client)));
  }
}
