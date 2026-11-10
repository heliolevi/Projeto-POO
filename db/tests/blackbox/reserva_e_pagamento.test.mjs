// Testes de caixa-preta da migration 0006: simulam o que o backend faz (criar reserva, cancelar,
// consultar como um cliente logado) e só verificam o resultado observável — nenhum teste aqui
// depende do nome de uma constraint ou de uma política. Comparar com tests/unit (que conhece os
// nomes) e tests/whitebox (que inspeciona o catálogo).
//
// node tests/blackbox/reserva_e_pagamento.test.mjs
//
// O teste de RLS precisa que a conexão (o dono do banco) consiga assumir o papel app_backend
// (SET ROLE), porque o dono das tabelas sempre ignora a RLS.

import { rodarSuite } from '../suporte.mjs';
import { criarFixtures, criarReserva } from '../fixtures.mjs';

await rodarSuite('blackbox/reserva_e_pagamento', async (executor, client) => {
  const { teste, assert, comSavepoint } = executor;
  const ctx = await criarFixtures(client);

  async function bicicletaEstaLivre(inicio, fim) {
    const { rows } = await client.query(
      `SELECT NOT EXISTS (
         SELECT 1 FROM reserva
         WHERE bicicleta_id = $1
           AND status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADA', 'EM_ANDAMENTO')
           AND periodo && tstzrange($2::timestamptz, $3::timestamptz, '[)')
       ) AS livre`,
      [ctx.bicicletaId, inicio, fim],
    );
    return rows[0].livre;
  }

  // ---------------------------------------------------------------------------
  // 1) Sobreposição na mesma bicicleta é rejeitada.
  // ---------------------------------------------------------------------------
  await teste('não é possível reservar uma bicicleta já reservada no mesmo horário', async () => {
    await comSavepoint(async () => {
      await criarReserva(client, ctx, { inicio: '2026-03-10T10:00:00Z', fim: '2026-03-10T14:00:00Z' });

      assert(
        !(await bicicletaEstaLivre('2026-03-10T12:00:00Z', '2026-03-10T16:00:00Z')),
        'a bicicleta deveria aparecer ocupada no horário que se sobrepõe',
      );

      let aceitou = true;
      try {
        await criarReserva(client, ctx, {
          clienteId: ctx.clienteBId,
          inicio: '2026-03-10T12:00:00Z',
          fim: '2026-03-10T16:00:00Z',
        });
      } catch {
        aceitou = false;
      }
      assert(!aceitou, 'a segunda reserva, sobreposta, não deveria ter sido aceita');
    });
  });

  // ---------------------------------------------------------------------------
  // 2) Períodos encostados (fim de um = início do outro) são aceitos.
  // ---------------------------------------------------------------------------
  await teste('reservar a bicicleta a partir do minuto em que a reserva anterior termina funciona', async () => {
    await comSavepoint(async () => {
      await criarReserva(client, ctx, { inicio: '2026-03-11T10:00:00Z', fim: '2026-03-11T14:00:00Z' });

      assert(
        await bicicletaEstaLivre('2026-03-11T14:00:00Z', '2026-03-11T18:00:00Z'),
        'a bicicleta deveria aparecer livre a partir do fim da reserva anterior',
      );

      const id = await criarReserva(client, ctx, {
        clienteId: ctx.clienteBId,
        inicio: '2026-03-11T14:00:00Z',
        fim: '2026-03-11T18:00:00Z',
      });
      assert(id, 'a segunda reserva, encostada na primeira, deveria ter sido aceita');
    });
  });

  // ---------------------------------------------------------------------------
  // 3) Cancelar uma reserva libera a bicicleta para o mesmo horário.
  // ---------------------------------------------------------------------------
  await teste('cancelar uma reserva libera a bicicleta no mesmo horário', async () => {
    await comSavepoint(async () => {
      const reservaId = await criarReserva(client, ctx, {
        inicio: '2026-03-12T10:00:00Z',
        fim: '2026-03-12T14:00:00Z',
      });

      assert(
        !(await bicicletaEstaLivre('2026-03-12T10:00:00Z', '2026-03-12T14:00:00Z')),
        'a bicicleta deveria estar ocupada antes do cancelamento',
      );

      await client.query(
        `UPDATE reserva SET status = 'CANCELADA', cancelada_em = now() WHERE id = $1`,
        [reservaId],
      );

      assert(
        await bicicletaEstaLivre('2026-03-12T10:00:00Z', '2026-03-12T14:00:00Z'),
        'a bicicleta deveria estar livre depois do cancelamento',
      );

      const novaId = await criarReserva(client, ctx, {
        clienteId: ctx.clienteBId,
        inicio: '2026-03-12T10:00:00Z',
        fim: '2026-03-12T14:00:00Z',
      });
      assert(novaId, 'deveria ser possível reservar o mesmo horário depois do cancelamento');
    });
  });

  // ---------------------------------------------------------------------------
  // 4) Cada cliente só vê as próprias reservas.
  // ---------------------------------------------------------------------------
  await teste('o cliente A não vê a reserva do cliente B, e vice-versa', async () => {
    await comSavepoint(async () => {
      const reservaAId = await criarReserva(client, ctx, {
        clienteId: ctx.clienteAId,
        inicio: '2026-03-13T10:00:00Z',
        fim: '2026-03-13T14:00:00Z',
      });
      const reservaBId = await criarReserva(client, ctx, {
        clienteId: ctx.clienteBId,
        inicio: '2026-03-14T10:00:00Z',
        fim: '2026-03-14T14:00:00Z',
      });

      try {
        await client.query('GRANT app_backend TO CURRENT_USER');
      } catch (erro) {
        throw new Error(
          `não foi possível assumir o papel app_backend (${erro.message}). ` +
            'Rode este teste conectado como o dono do banco, com privilégio para conceder o papel.',
        );
      }

      async function reservasVisiveisPara(clienteId) {
        await client.query('SET ROLE app_backend');
        try {
          await client.query(
            "SELECT set_config('app.perfil', 'CLIENTE', true), set_config('app.usuario_id', $1, true)",
            [clienteId],
          );
          const { rows } = await client.query(
            'SELECT id FROM reserva WHERE id IN ($1, $2)',
            [reservaAId, reservaBId],
          );
          return rows.map((r) => r.id);
        } finally {
          await client.query('RESET ROLE');
        }
      }

      const vistasPorA = await reservasVisiveisPara(ctx.clienteAId);
      assert(
        vistasPorA.length === 1 && vistasPorA[0] === reservaAId,
        'o cliente A deveria ver só a própria reserva',
      );

      const vistasPorB = await reservasVisiveisPara(ctx.clienteBId);
      assert(
        vistasPorB.length === 1 && vistasPorB[0] === reservaBId,
        'o cliente B deveria ver só a própria reserva',
      );
    });
  });
});
