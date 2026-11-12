// Testes de caixa-preta da migration 0010: o que cada perfil consegue ler e escrever em
// movimentacao, com a sessão declarada como o comSessao do app faz.
//
// node tests/blackbox/movimentacao.test.mjs
//
// Precisa que a conexão (o dono do banco) consiga assumir o papel app_backend (SET ROLE).

import { rodarSuite } from '../suporte.mjs';
import { criarFixtures, criarReserva, criarOperador, criarMovimentacao } from '../fixtures.mjs';

await rodarSuite('blackbox/movimentacao', async (executor, client) => {
  const { teste, assert, esperarErro, comSavepoint } = executor;
  const ctx = await criarFixtures(client);
  const operadorId = await criarOperador(client);

  const reservaA = await criarReserva(client, ctx, {
    clienteId: ctx.clienteAId, inicio: '2026-06-01T10:00:00Z', fim: '2026-06-01T12:00:00Z',
  });
  const reservaB = await criarReserva(client, ctx, {
    clienteId: ctx.clienteBId, inicio: '2026-06-02T10:00:00Z', fim: '2026-06-02T12:00:00Z',
  });
  const movA = await criarMovimentacao(client, reservaA, operadorId);
  const movB = await criarMovimentacao(client, reservaB, operadorId);

  try {
    await client.query('GRANT app_backend TO CURRENT_USER');
  } catch (erro) {
    throw new Error(
      `não foi possível assumir o papel app_backend (${erro.message}). ` +
        'Rode este teste conectado como o dono do banco, com privilégio para conceder o papel.',
    );
  }

  // Roda fn como app_backend, com a sessão (perfil e usuário) declarada.
  async function como(perfil, usuarioId, fn) {
    await client.query('SET ROLE app_backend');
    try {
      await client.query(
        "SELECT set_config('app.perfil', $1, true), set_config('app.usuario_id', $2, true)",
        [perfil, usuarioId ?? ''],
      );
      return await fn();
    } finally {
      await client.query('RESET ROLE');
    }
  }

  const ver = async () => {
    const { rows } = await client.query('SELECT id FROM movimentacao WHERE id IN ($1, $2)', [movA, movB]);
    return rows.map((r) => r.id);
  };

  await teste('o cliente A vê só a movimentação da própria reserva', async () => {
    const vistas = await como('CLIENTE', ctx.clienteAId, ver);
    assert(vistas.length === 1 && vistas[0] === movA, 'o cliente A deveria ver só a própria movimentação');
  });

  await teste('o cliente B vê só a movimentação da própria reserva', async () => {
    const vistas = await como('CLIENTE', ctx.clienteBId, ver);
    assert(vistas.length === 1 && vistas[0] === movB, 'o cliente B deveria ver só a própria movimentação');
  });

  await teste('operador e admin veem todas as movimentações', async () => {
    for (const perfil of ['OPERADOR', 'ADMIN']) {
      const vistas = await como(perfil, operadorId, ver);
      assert(vistas.length === 2, `${perfil} deveria ver as duas movimentações`);
    }
  });

  await teste('visitante não vê movimentações', async () => {
    const vistas = await como('VISITANTE', null, ver);
    assert(vistas.length === 0, 'visitante não deveria ver nenhuma movimentação');
  });

  await teste('o cliente não consegue registrar uma movimentação', () =>
    como('CLIENTE', ctx.clienteAId, () =>
      comSavepoint(() => esperarErro(
        () => client.query(
          `INSERT INTO movimentacao (reserva_id, operador_id, tipo) VALUES ($1, $2, 'DEVOLUCAO')`,
          [reservaA, operadorId],
        ),
        '42501',
      ))));

  await teste('o cliente não consegue alterar a movimentação da própria reserva', async () => {
    const { rowCount } = await como('CLIENTE', ctx.clienteAId, () =>
      client.query(`UPDATE movimentacao SET observacoes = 'adulterada' WHERE id = $1`, [movA]));
    assert(rowCount === 0, 'o cliente não deveria alterar nenhuma linha');
  });

  await teste('o operador registra uma devolução', async () => {
    const { rowCount } = await como('OPERADOR', operadorId, () =>
      client.query(
        `INSERT INTO movimentacao (reserva_id, operador_id, tipo, checklist) VALUES ($1, $2, 'DEVOLUCAO', '[]')`,
        [reservaA, operadorId],
      ));
    assert(rowCount === 1, 'o operador deveria conseguir registrar a devolução');
  });

  await teste('ninguém apaga uma movimentação (sem DELETE para o app)', () =>
    como('ADMIN', operadorId, () =>
      comSavepoint(() => esperarErro(
        () => client.query('DELETE FROM movimentacao WHERE id = $1', [movA]),
        '42501',
      ))));
});
