import type { PoolClient } from "pg";
import { comSessao } from "../../../shared/db/sessao.ts";
import { ConflictError } from "../../../shared/http/errors.ts";
import type { LinhaReserva, OperacoesOperacao, TransacaoOperacao } from "../application/portas.ts";

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

function paraLinha(l: LinhaView): LinhaReserva {
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

const ehRepetida = (erro: unknown) =>
  typeof erro === "object" &&
  erro !== null &&
  (erro as { code?: string }).code === "23505" &&
  (erro as { constraint?: string }).constraint === "movimentacao_reserva_tipo_unico";

// Operações das rotas 26 e 27 dentro da transação do comSessao (papel do app, sessão da equipe). A
// tabela movimentacao (migration 0010) só aceita a equipe; o cliente nunca escreve nela.
export function operacoesNoBanco(client: PoolClient): OperacoesOperacao {
  return {
    async expirarVencidas() {
      await client.query("SELECT expirar_reservas_vencidas()");
    },

    // FOR UPDATE na linha de reserva (a view não se trava) e, já com a trava, a leitura completa:
    // duas retiradas ao mesmo tempo, ou a retirada e um cancelamento, passam uma de cada vez.
    async travarReserva(id) {
      const { rowCount } = await client.query("SELECT 1 FROM reserva WHERE id = $1 FOR UPDATE", [id]);
      if (rowCount === 0) return null;
      const { rows } = await client.query<LinhaView>(
        `SELECT ${COLUNAS_VIEW} FROM reserva_detalhada WHERE id = $1`,
        [id],
      );
      return rows[0] ? paraLinha(rows[0]) : null;
    },

    // Cada tentativa tem o seu SAVEPOINT: a recusa por repetição (23505) desfaz só o INSERT, e a
    // transação segue de pé para o 409.
    async registrarMovimentacao(m) {
      await client.query("SAVEPOINT tentativa_movimentacao");
      try {
        await client.query(
          `INSERT INTO movimentacao (reserva_id, operador_id, tipo, checklist, observacoes)
           VALUES ($1, $2, $3::tipo_movimentacao, $4::jsonb, $5)`,
          [m.reservaId, m.operadorId, m.tipo, JSON.stringify(m.itens), m.observacoes],
        );
        await client.query("RELEASE SAVEPOINT tentativa_movimentacao");
      } catch (erro) {
        if (!ehRepetida(erro)) throw erro;
        await client.query("ROLLBACK TO SAVEPOINT tentativa_movimentacao");
        const qual = m.tipo === "RETIRADA" ? "A retirada" : "A devolução";
        throw new ConflictError(`${qual} desta reserva já foi registrada.`);
      }
    },

    async mudarStatus(id, de, para) {
      const { rowCount } = await client.query(
        `UPDATE reserva SET status = $3::status_reserva WHERE id = $1 AND status = $2::status_reserva`,
        [id, de, para],
      );
      return rowCount === 1;
    },

    async bicicletaDaReserva(id) {
      const { rows } = await client.query<{ id: string; codigo: string }>(
        `SELECT b.id, b.codigo FROM reserva r JOIN bicicleta b ON b.id = r.bicicleta_id WHERE r.id = $1`,
        [id],
      );
      return rows[0] ?? null;
    },
  };
}

export const emTransacao: TransacaoOperacao = (sessao, fn) =>
  comSessao(sessao, (client) => fn(operacoesNoBanco(client)));
