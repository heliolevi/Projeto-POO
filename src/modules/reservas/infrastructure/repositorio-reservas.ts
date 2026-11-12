import type { PoolClient } from "pg";
import { comSessao } from "../../../shared/db/sessao.ts";
import type { LinhaReserva, OperacoesReservas, Transacao } from "../application/portas.ts";
import { CodigoRepetido, SobreposicaoDePeriodo } from "../domain/erros.ts";

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

// reserva_detalhada (migration 0010) monta o objeto reserva do contrato com tipo, ponto e último
// pagamento, e filtra pela sessão como a política de RLS de reserva: o cliente só vê as próprias.
// O cliente não lê as tabelas bicicleta e pagamento direto, por isso a leitura passa pela view.
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

function erroDoBanco(erro: unknown): { code?: string; constraint?: string } {
  return typeof erro === "object" && erro !== null
    ? (erro as { code?: string; constraint?: string })
    : {};
}

// Datas vão como parâmetros (ISO), nunca dentro do texto SQL.
export function operacoesNoBanco(client: PoolClient): OperacoesReservas {
  async function lerPorId(id: string): Promise<LinhaReserva | null> {
    const { rows } = await client.query<LinhaView>(
      `SELECT ${COLUNAS_VIEW} FROM reserva_detalhada WHERE id = $1`,
      [id],
    );
    return rows[0] ? paraLinha(rows[0]) : null;
  }

  return {
    // expirar_reservas_vencidas() é SECURITY DEFINER (migration 0008): a RLS só deixa o cliente
    // ver as próprias reservas, e a expiração vale para todas.
    async expirarVencidas() {
      await client.query("SELECT expirar_reservas_vencidas()");
    },

    async buscarTipo(tipoId) {
      // a política tipo_bicicleta_publico só mostra os tipos ativos ao cliente
      const { rows } = await client.query<{
        id: string;
        nome: string;
        preco_hora_centavos: number;
        preco_dia_centavos: number;
        valor_caucao_centavos: number;
      }>(
        `SELECT id, nome, preco_hora_centavos, preco_dia_centavos, valor_caucao_centavos
           FROM tipo_bicicleta WHERE id = $1 AND ativo`,
        [tipoId],
      );
      const t = rows[0];
      return t
        ? {
            id: t.id,
            nome: t.nome,
            precoHoraCentavos: t.preco_hora_centavos,
            precoDiaCentavos: t.preco_dia_centavos,
            valorCaucaoCentavos: t.valor_caucao_centavos,
          }
        : null;
    },

    // escolher_unidade_para_reserva() (migration 0010): unidade DISPONIVEL do tipo, sem reserva
    // ativa sobreposta, FOR UPDATE SKIP LOCKED. É SECURITY DEFINER porque o cliente não lê
    // bicicleta e não vê as reservas dos outros.
    async escolherUnidade(tipoId, inicio, fim, excluir) {
      const { rows } = await client.query<{ bicicleta_id: string; ponto_id: string }>(
        `SELECT bicicleta_id, ponto_id
           FROM escolher_unidade_para_reserva($1::uuid, $2::timestamptz, $3::timestamptz, $4::uuid[])`,
        [tipoId, inicio.toISOString(), fim.toISOString(), excluir],
      );
      return rows[0] ? { bicicletaId: rows[0].bicicleta_id, pontoId: rows[0].ponto_id } : null;
    },

    // Um erro dentro de uma transação do PostgreSQL a deixa abortada: nada mais roda até o
    // ROLLBACK. Por isso cada tentativa de gravar tem o seu SAVEPOINT, e a recusa por sobreposição
    // desfaz só a tentativa, deixando a transação (e as travas das outras unidades) de pé.
    async inserir(nova) {
      await client.query("SAVEPOINT tentativa_reserva");
      try {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO reserva
             (codigo, cliente_id, bicicleta_id, ponto_id, periodo, status,
              valor_aluguel_centavos, valor_caucao_centavos)
           VALUES ($1, $2, $3, $4, tstzrange($5::timestamptz, $6::timestamptz, '[)'),
                   'PENDENTE_PAGAMENTO', $7, $8)
           RETURNING id`,
          [
            nova.codigo,
            nova.clienteId,
            nova.bicicletaId,
            nova.pontoId,
            nova.inicio.toISOString(),
            nova.fim.toISOString(),
            nova.valorAluguelCentavos,
            nova.valorCaucaoCentavos,
          ],
        );
        await client.query("RELEASE SAVEPOINT tentativa_reserva");
        const linha = await lerPorId(rows[0].id);
        if (!linha) throw new Error("A reserva gravada não apareceu na leitura (RLS ou view).");
        return linha;
      } catch (erro) {
        const { code, constraint } = erroDoBanco(erro);
        const recusaConhecida =
          code === "23P01" || (code === "23505" && constraint === "reserva_codigo_unico");
        if (recusaConhecida) await client.query("ROLLBACK TO SAVEPOINT tentativa_reserva");
        if (code === "23P01") throw new SobreposicaoDePeriodo();
        if (recusaConhecida) throw new CodigoRepetido();
        throw erro;
      }
    },

    async listar(status) {
      const { rows } = await client.query<LinhaView>(
        `SELECT ${COLUNAS_VIEW}
           FROM reserva_detalhada
          WHERE ($1::status_reserva IS NULL OR status = $1::status_reserva)
          ORDER BY criado_em DESC, id`,
        [status],
      );
      return rows.map(paraLinha);
    },

    buscar: lerPorId,

    // FOR UPDATE: segura a linha até o fim da transação, então um cancelamento concorrente (ou a
    // retirada) espera e vê o status já mudado. A RLS só deixa ver as reservas do cliente.
    async travarStatus(id) {
      const { rows } = await client.query<{ status: LinhaReserva["status"] }>(
        "SELECT status FROM reserva WHERE id = $1 FOR UPDATE",
        [id],
      );
      return rows[0]?.status ?? null;
    },

    async marcarCancelada(id) {
      await client.query(
        `UPDATE reserva SET status = 'CANCELADA', cancelada_em = now()
          WHERE id = $1 AND status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADA')`,
        [id],
      );
    },
  };
}

export const emTransacao: Transacao = (sessao, fn) =>
  comSessao(sessao, (client) => fn(operacoesNoBanco(client)));
