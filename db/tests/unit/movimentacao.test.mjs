// Testes unitários da migration 0007 (movimentacao): cada teste viola (ou confirma que não
// viola) exatamente UMA regra, conferindo o SQLSTATE e o nome da constraint.
//
// node tests/unit/movimentacao.test.mjs

import { deepStrictEqual } from 'node:assert';
import { rodarSuite } from '../suporte.mjs';
import { criarFixtures, criarReserva, criarOperador, criarMovimentacao } from '../fixtures.mjs';

await rodarSuite('unit/movimentacao', async (executor, client) => {
  const { teste, assert, esperarErro } = executor;
  const ctx = await criarFixtures(client);
  const operadorId = await criarOperador(client);

  await teste('aceita uma retirada e uma devolução da mesma reserva', async () => {
    const reservaId = await criarReserva(client, ctx);
    await criarMovimentacao(client, reservaId, operadorId, { tipo: 'RETIRADA' });
    const id = await criarMovimentacao(client, reservaId, operadorId, { tipo: 'DEVOLUCAO' });
    assert(id, 'a devolução deveria ter sido criada');
  });

  await teste('movimentacao_reserva_tipo_unico rejeita uma segunda retirada da mesma reserva', async () => {
    const reservaId = await criarReserva(client, ctx);
    await criarMovimentacao(client, reservaId, operadorId, { tipo: 'RETIRADA' });
    await esperarErro(
      () => criarMovimentacao(client, reservaId, operadorId, { tipo: 'RETIRADA' }),
      '23505',
      'movimentacao_reserva_tipo_unico',
    );
  });

  await teste('movimentacao_reserva_tipo_unico rejeita uma segunda devolução da mesma reserva', async () => {
    const reservaId = await criarReserva(client, ctx);
    await criarMovimentacao(client, reservaId, operadorId, { tipo: 'DEVOLUCAO' });
    await esperarErro(
      () => criarMovimentacao(client, reservaId, operadorId, { tipo: 'DEVOLUCAO' }),
      '23505',
      'movimentacao_reserva_tipo_unico',
    );
  });

  await teste('reservas diferentes podem ter, cada uma, a sua retirada', async () => {
    const reserva1 = await criarReserva(client, ctx, { inicio: '2026-05-01T10:00:00Z', fim: '2026-05-01T12:00:00Z' });
    const reserva2 = await criarReserva(client, ctx, { inicio: '2026-05-02T10:00:00Z', fim: '2026-05-02T12:00:00Z' });
    await criarMovimentacao(client, reserva1, operadorId);
    await criarMovimentacao(client, reserva2, operadorId); // não deve lançar
  });

  await teste('movimentacao_checklist_lista rejeita checklist que não é uma lista', async () => {
    const reservaId = await criarReserva(client, ctx);
    await esperarErro(
      () => criarMovimentacao(client, reservaId, operadorId, { checklist: { freio: true } }),
      '23514',
      'movimentacao_checklist_lista',
    );
  });

  await teste('o checklist guarda a lista enviada', async () => {
    const reservaId = await criarReserva(client, ctx);
    const itens = [{ item: 'freios', ok: true }, { item: 'pneus', ok: false }];
    const id = await criarMovimentacao(client, reservaId, operadorId, { checklist: itens });
    const { rows: [m] } = await client.query('SELECT checklist FROM movimentacao WHERE id = $1', [id]);
    deepStrictEqual(m.checklist, itens); // jsonb não preserva a ordem das chaves
  });

  await teste('tipo aceita apenas os valores do enum tipo_movimentacao', async () => {
    const reservaId = await criarReserva(client, ctx);
    await esperarErro(() => criarMovimentacao(client, reservaId, operadorId, { tipo: 'TROCA' }), '22P02');
  });

  await teste('a FK de reserva_id rejeita uma reserva inexistente', () =>
    esperarErro(
      () => criarMovimentacao(client, '00000000-0000-0000-0000-000000000000', operadorId),
      '23503',
    ));

  await teste('a FK de operador_id rejeita um usuário inexistente', async () => {
    const reservaId = await criarReserva(client, ctx);
    await esperarErro(
      () => criarMovimentacao(client, reservaId, '00000000-0000-0000-0000-000000000000'),
      '23503',
    );
  });

  await teste('data_hora é preenchida automaticamente', async () => {
    const reservaId = await criarReserva(client, ctx);
    const id = await criarMovimentacao(client, reservaId, operadorId);
    const { rows: [m] } = await client.query('SELECT data_hora FROM movimentacao WHERE id = $1', [id]);
    assert(m.data_hora instanceof Date, 'data_hora deveria ter um valor padrão');
  });
});
