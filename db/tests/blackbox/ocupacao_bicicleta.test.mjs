// Testes de caixa-preta da view bicicleta_ocupada (migration 0007): o que a busca de
// disponibilidade enxerga das reservas. Só verificam o resultado observável.
//
// node tests/blackbox/ocupacao_bicicleta.test.mjs
//
// O teste de RLS precisa que a conexão (o dono do banco) consiga assumir o papel app_backend
// (SET ROLE), como o de reserva_e_pagamento.

import { rodarSuite } from '../suporte.mjs';
import { criarFixtures, criarReserva } from '../fixtures.mjs';

await rodarSuite('blackbox/ocupacao_bicicleta', async (executor, client) => {
  const { teste, assert, comSavepoint } = executor;
  const ctx = await criarFixtures(client);

  async function ocupacoes() {
    const { rows } = await client.query(
      `SELECT bicicleta_id, periodo::text AS periodo FROM bicicleta_ocupada WHERE bicicleta_id = $1`,
      [ctx.bicicletaId],
    );
    return rows;
  }

  // Cria uma reserva já com a idade pedida (a criação é sempre "agora"; a idade só importa
  // para a pendente de pagamento).
  async function reservaCom({ status, minutosAtras = 0, canceladaEm = null }) {
    const id = await criarReserva(client, ctx, {
      status,
      canceladaEm,
      inicio: '2026-06-10T10:00:00Z',
      fim: '2026-06-10T14:00:00Z',
    });
    if (minutosAtras > 0) {
      await client.query(`UPDATE reserva SET criado_em = now() - ($2::int * interval '1 minute') WHERE id = $1`, [id, minutosAtras]);
    }
    return id;
  }

  await teste('uma reserva confirmada ocupa a bicicleta no período dela', async () => {
    await reservaCom({ status: 'CONFIRMADA' });
    const linhas = await ocupacoes();
    assert(linhas.length === 1, 'a bicicleta deveria aparecer ocupada uma vez');
    assert(linhas[0].periodo.includes('2026-06-10 10:00:00+00'), `período inesperado: ${linhas[0].periodo}`);
  });

  await teste('uma reserva em andamento também ocupa', async () => {
    await reservaCom({ status: 'EM_ANDAMENTO' });
    assert((await ocupacoes()).length === 1, 'em andamento deveria ocupar');
  });

  await teste('pendente de pagamento ocupa só enquanto está dentro dos 15 minutos', async () => {
    await comSavepoint(async () => {
      await reservaCom({ status: 'PENDENTE_PAGAMENTO' });
      assert((await ocupacoes()).length === 1, 'pendente recém-criada deveria ocupar');
    });
    await comSavepoint(async () => {
      await reservaCom({ status: 'PENDENTE_PAGAMENTO', minutosAtras: 14 });
      assert((await ocupacoes()).length === 1, 'pendente de 14 minutos ainda deveria ocupar');
    });
    await comSavepoint(async () => {
      await reservaCom({ status: 'PENDENTE_PAGAMENTO', minutosAtras: 16 });
      assert((await ocupacoes()).length === 0, 'pendente vencida (16 minutos) não deveria ocupar, mesmo sem ninguém ter listado');
    });
  });

  await teste('canceladas, expiradas, concluídas e não retiradas não ocupam', async () => {
    for (const [status, canceladaEm] of [
      ['CANCELADA', new Date().toISOString()],
      ['EXPIRADA', null],
      ['CONCLUIDA', null],
      ['NAO_RETIRADA', null],
    ]) {
      await comSavepoint(async () => {
        await reservaCom({ status, canceladaEm });
        assert((await ocupacoes()).length === 0, `${status} não deveria ocupar`);
      });
    }
  });

  await teste('a view mostra só a bicicleta e o período, sem dados do cliente nem valores', async () => {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'bicicleta_ocupada' ORDER BY column_name`,
    );
    assert(
      JSON.stringify(rows.map((r) => r.column_name)) === JSON.stringify(['bicicleta_id', 'periodo']),
      `colunas inesperadas: ${rows.map((r) => r.column_name).join(', ')}`,
    );
  });

  await teste('um cliente enxerga a ocupação criada por outro, embora a RLS esconda a reserva', async () => {
    await comSavepoint(async () => {
      const reservaAId = await reservaCom({ status: 'CONFIRMADA' });

      async function comoCliente(clienteId, fn) {
        await client.query('SET ROLE app_backend');
        try {
          await client.query(
            "SELECT set_config('app.perfil', 'CLIENTE', true), set_config('app.usuario_id', $1, true)",
            [clienteId],
          );
          return await fn();
        } finally {
          await client.query('RESET ROLE');
        }
      }

      const reservasVistasPorB = await comoCliente(ctx.clienteBId, async () =>
        (await client.query('SELECT id FROM reserva WHERE id = $1', [reservaAId])).rows.length,
      );
      assert(reservasVistasPorB === 0, 'o cliente B não deveria ver a reserva do cliente A (RLS)');

      const ocupacaoVistaPorB = await comoCliente(ctx.clienteBId, async () =>
        (await client.query('SELECT 1 FROM bicicleta_ocupada WHERE bicicleta_id = $1', [ctx.bicicletaId])).rows.length,
      );
      assert(ocupacaoVistaPorB === 1, 'o cliente B deveria ver a bicicleta ocupada pela view');
    });
  });

  await teste('o visitante (sem sessão) também consegue consultar a view', async () => {
    await comSavepoint(async () => {
      await reservaCom({ status: 'CONFIRMADA' });
      await client.query('SET ROLE app_backend');
      try {
        await client.query("SELECT set_config('app.perfil', '', true), set_config('app.usuario_id', '', true)");
        const { rows } = await client.query('SELECT 1 FROM bicicleta_ocupada WHERE bicicleta_id = $1', [ctx.bicicletaId]);
        assert(rows.length === 1, 'o visitante deveria enxergar a ocupação');
      } finally {
        await client.query('RESET ROLE');
      }
    });
  });
});
