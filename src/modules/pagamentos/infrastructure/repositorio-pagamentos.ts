import type { PoolClient } from "pg";
import { Dinheiro } from "../../../shared/dominio/dinheiro.ts";
import { PRAZO_DE_PAGAMENTO_MS } from "../../../shared/dominio/prazos.ts";
import { VISITANTE, comSessao } from "../../../shared/db/sessao.ts";
import type { OperacoesPagamento, TransacaoPagamento } from "../application/portas.ts";
import { PagamentoPix, criarPagamento } from "../domain/formas-de-pagamento.ts";
import type { MetodoPagamento, Pagamento, StatusPagamento } from "../domain/pagamento.ts";

type LinhaPagamento = {
  id: string;
  reserva_id: string;
  metodo: MetodoPagamento;
  valor_centavos: number;
  status: StatusPagamento;
  mp_payment_id: string | null;
  pix_expira_em: Date | null;
  qr_code_pix: string | null;
  pago_em: Date | null;
  criado_em: Date;
};

const COLUNAS = `id, reserva_id, metodo, valor_centavos, status, mp_payment_id, pix_expira_em, qr_code_pix, pago_em, criado_em`;

// A linha do banco vira a subclasse certa (Pix ou cartão) pela fábrica do domínio.
function paraPagamento(l: LinhaPagamento): Pagamento {
  return criarPagamento(l.metodo, {
    id: l.id,
    reservaId: l.reserva_id,
    valor: Dinheiro.deCentavos(l.valor_centavos),
    criadoEm: l.criado_em,
    status: l.status,
    mpPaymentId: l.mp_payment_id,
    pagoEm: l.pago_em,
    expiraEm: l.pix_expira_em,
    copiaECola: l.qr_code_pix,
  });
}

// Operações das rotas 16, 17 e 18, dentro da transação do comSessao (papel do
// app, sessão do cliente declarada). A RLS de reserva e de pagamento (migration 0006) é quem
// garante que o cliente só toca nas próprias reservas: uma reserva de outro cliente simplesmente
// não aparece (404). SQL sempre parametrizado; datas vão como ISO.
export function operacoesNoBanco(client: PoolClient): OperacoesPagamento {
  return {
    async expirarVencidas() {
      await client.query("SELECT expirar_reservas_vencidas()");
    },

    // FOR UPDATE: duas chamadas ao mesmo tempo para a mesma reserva (clique duplo, duas abas)
    // passam uma de cada vez, então não nascem dois Pix pendentes nem uma aprovação dupla.
    async travarReserva(reservaId) {
      const { rows } = await client.query<{
        id: string;
        status: string;
        valor_aluguel_centavos: number;
        criado_em: Date;
      }>(
        `SELECT id, status, valor_aluguel_centavos, criado_em
           FROM reserva WHERE id = $1 FOR UPDATE`,
        [reservaId],
      );
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        status: r.status,
        valorAluguelCentavos: r.valor_aluguel_centavos,
        // o mesmo prazo de expirar_reservas_vencidas(): criação + 15 minutos
        expiraEm:
          r.status === "PENDENTE_PAGAMENTO" ? new Date(r.criado_em.getTime() + PRAZO_DE_PAGAMENTO_MS) : null,
      };
    },

    // reserva_detalhada (migration 0011) já traz o status do pagamento mais recente e filtra pela
    // sessão como a política de reserva.
    async situacao(reservaId) {
      const { rows } = await client.query<{ status: string; pagamento_status: StatusPagamento | null }>(
        `SELECT status, pagamento_status FROM reserva_detalhada WHERE id = $1`,
        [reservaId],
      );
      return rows[0] ? { statusReserva: rows[0].status, statusPagamento: rows[0].pagamento_status } : null;
    },

    // O prazo também é conferido aqui (e não só em expirar_reservas_vencidas, que pula linhas
    // travadas): uma reserva vencida nunca é confirmada.
    async confirmarReserva(reservaId) {
      const { rowCount } = await client.query(
        `UPDATE reserva SET status = 'CONFIRMADA'
          WHERE id = $1 AND status = 'PENDENTE_PAGAMENTO'
            AND criado_em > now() - make_interval(secs => $2::double precision / 1000)`,
        [reservaId, PRAZO_DE_PAGAMENTO_MS],
      );
      return rowCount === 1;
    },

    // Grava o pagamento novo ou o que mudou (status, aprovação, estorno). O "copia e cola" que a
    // Stripe devolveu fica em qr_code_pix, para o mesmo Pix pendente poder ser mostrado de novo.
    async salvar(pagamento) {
      const ehPix = pagamento instanceof PagamentoPix;
      const pixExpiraEm = ehPix ? pagamento.expiraEm().toISOString() : null;
      const copiaECola = ehPix ? pagamento.copiaECola : null;
      await client.query(
        `INSERT INTO pagamento
           (id, reserva_id, metodo, valor_centavos, status, mp_payment_id, pix_expira_em, pago_em, criado_em,
            qr_code_pix)
         VALUES ($1, $2, $3::metodo_pagamento, $4, $5::status_pagamento, $6, $7::timestamptz, $8::timestamptz,
                 $9::timestamptz, $10)
         ON CONFLICT (id) DO UPDATE
           SET status = EXCLUDED.status,
               mp_payment_id = EXCLUDED.mp_payment_id,
               pago_em = EXCLUDED.pago_em`,
        [
          pagamento.id,
          pagamento.reservaId,
          pagamento.metodo,
          pagamento.valor.centavos,
          pagamento.status,
          pagamento.mpPaymentId,
          pixExpiraEm,
          pagamento.pagoEmParaPersistir()?.toISOString() ?? null,
          pagamento.criadoEm.toISOString(),
          copiaECola,
        ],
      );
    },

    // nome e e-mail do cliente da sessão, para a cobrança na Stripe
    async pagador() {
      const { rows } = await client.query<{ nome: string; email: string }>(
        `SELECT nome, email::text AS email FROM usuario WHERE id = sessao_usuario_id()`,
      );
      return rows[0] ?? null;
    },

    async buscarPorIdExterno(idExterno) {
      const { rows } = await client.query<LinhaPagamento>(
        `SELECT ${COLUNAS} FROM pagamento WHERE mp_payment_id = $1`,
        [idExterno],
      );
      return rows[0] ? paraPagamento(rows[0]) : null;
    },

    async travarPorIdExterno(idExterno) {
      const { rows } = await client.query<LinhaPagamento>(
        `SELECT ${COLUNAS} FROM pagamento WHERE mp_payment_id = $1 FOR UPDATE`,
        [idExterno],
      );
      return rows[0] ? paraPagamento(rows[0]) : null;
    },

    async buscarPorId(id) {
      const { rows } = await client.query<LinhaPagamento>(`SELECT ${COLUNAS} FROM pagamento WHERE id = $1`, [id]);
      return rows[0] ? paraPagamento(rows[0]) : null;
    },

    async buscarPendenteDaReserva(reservaId) {
      const { rows } = await client.query<LinhaPagamento>(
        `SELECT ${COLUNAS} FROM pagamento
          WHERE reserva_id = $1 AND status = 'PENDENTE'
          ORDER BY criado_em DESC LIMIT 1`,
        [reservaId],
      );
      return rows[0] ? paraPagamento(rows[0]) : null;
    },
  };
}

// O aviso da Stripe chega sem sessão: cliente_do_pagamento() (migration 0012, SECURITY DEFINER)
// diz de quem é a cobrança, e o resto do processamento roda com a sessão desse cliente.
export async function clienteDoPagamento(idExterno: string): Promise<string | null> {
  return comSessao(VISITANTE, async (client) => {
    const { rows } = await client.query<{ cliente_id: string | null }>(
      "SELECT cliente_do_pagamento($1) AS cliente_id",
      [idExterno],
    );
    return rows[0]?.cliente_id ?? null;
  });
}

export const emTransacao: TransacaoPagamento = (sessao, fn) =>
  comSessao(sessao, (client) => fn(operacoesNoBanco(client)));
