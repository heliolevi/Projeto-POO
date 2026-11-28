// Testes unitários da migration 0008: a constraint reserva_periodo_finito e os triggers de
// atualizado_em. Cada teste mexe em exatamente uma regra.
//
// node tests/unit/reserva_integridade.test.mjs

import { rodarSuite } from '../suporte.mjs';
import { criarFixtures, criarReserva, criarPagamento } from '../fixtures.mjs';

await rodarSuite('unit/reserva_integridade', async (executor, client) => {
  const { teste, assert, esperarErro } = executor;
  const ctx = await criarFixtures(client);

  // -------------------------------------------------------------------------
  // reserva_periodo_finito
  // -------------------------------------------------------------------------
  const rejeita = (nome, periodoSql) =>
    teste(`reserva_periodo_finito rejeita ${nome}`, () =>
      esperarErro(() => criarReserva(client, ctx, { periodoSql }), '23514', 'reserva_periodo_finito'));

  await rejeita('fim aberto [início,)', `tstzrange('2026-05-01T10:00Z'::timestamptz, NULL, '[)')`);
  await rejeita('fim em infinity', `tstzrange('2026-05-01T10:00Z'::timestamptz, 'infinity'::timestamptz, '[)')`);
  await rejeita('início em -infinity', `tstzrange('-infinity'::timestamptz, '2026-05-01T10:00Z'::timestamptz, '[)')`);

  await teste('o período invertido (início depois do fim) nem chega a existir: o PostgreSQL recusa o tstzrange', () =>
    esperarErro(
      () => criarReserva(client, ctx, {
        periodoSql: `tstzrange('2026-05-01T14:00Z'::timestamptz, '2026-05-01T10:00Z'::timestamptz, '[)')`,
      }),
      '22000',
    ));

  await teste('reserva_periodo_finito aceita início antes do fim, com 1 minuto de duração', async () => {
    const id = await criarReserva(client, ctx, { inicio: '2026-05-02T10:00:00Z', fim: '2026-05-02T10:01:00Z' });
    assert(id, 'a reserva deveria ter sido criada');
  });

  await teste('UPDATE que deixa a reserva com fim aberto também é rejeitado', async () => {
    const id = await criarReserva(client, ctx, { inicio: '2026-05-03T10:00:00Z', fim: '2026-05-03T12:00:00Z' });
    await esperarErro(
      () => client.query(`UPDATE reserva SET periodo = tstzrange(lower(periodo), NULL, '[)') WHERE id = $1`, [id]),
      '23514',
      'reserva_periodo_finito',
    );
  });

  // -------------------------------------------------------------------------
  // valores >= 0 (0006) continuam valendo no limite: zero é aceito, -1 não
  // -------------------------------------------------------------------------
  await teste('valores iguais a zero são aceitos (reserva e pagamento)', async () => {
    const id = await criarReserva(client, ctx, {
      inicio: '2026-05-04T10:00:00Z', fim: '2026-05-04T12:00:00Z', valorAluguelCentavos: 0, valorCaucaoCentavos: 0,
    });
    const pagamentoId = await criarPagamento(client, id, { valorCentavos: 0 });
    assert(pagamentoId, 'o pagamento de valor zero deveria ter sido criado');
  });

  // -------------------------------------------------------------------------
  // atualizado_em
  // -------------------------------------------------------------------------
  // Toda a suíte roda numa transação e now() é fixo dentro dela; por isso as linhas nascem com
  // atualizado_em no passado, e o trigger prova que mexeu ao trazer o valor para "agora".
  await teste('reserva.atualizado_em é preenchido na criação', async () => {
    const id = await criarReserva(client, ctx, { inicio: '2026-05-05T10:00:00Z', fim: '2026-05-05T12:00:00Z' });
    const { rows: [r] } = await client.query('SELECT atualizado_em = criado_em AS igual FROM reserva WHERE id = $1', [id]);
    assert(r.igual, 'atualizado_em deveria começar igual a criado_em');
  });

  await teste('o trigger atualiza reserva.atualizado_em a cada UPDATE', async () => {
    const id = await criarReserva(client, ctx, { inicio: '2026-05-06T10:00:00Z', fim: '2026-05-06T12:00:00Z' });
    // com o trigger desligado dá para colocar o valor no passado
    await client.query('ALTER TABLE reserva DISABLE TRIGGER reserva_atualizado_em');
    await client.query(`UPDATE reserva SET atualizado_em = '2020-01-01T00:00:00Z' WHERE id = $1`, [id]);
    await client.query('ALTER TABLE reserva ENABLE TRIGGER reserva_atualizado_em');

    await client.query(`UPDATE reserva SET valor_caucao_centavos = 100 WHERE id = $1`, [id]);
    const { rows: [r] } = await client.query('SELECT atualizado_em > $2::timestamptz AS atualizou FROM reserva WHERE id = $1', [id, '2020-01-01']);
    assert(r.atualizou, 'atualizado_em deveria ter sido renovado pelo UPDATE');
  });

  await teste('o trigger atualiza pagamento.atualizado_em a cada UPDATE', async () => {
    const reservaId = await criarReserva(client, ctx, { inicio: '2026-05-07T10:00:00Z', fim: '2026-05-07T12:00:00Z' });
    const id = await criarPagamento(client, reservaId);
    await client.query('ALTER TABLE pagamento DISABLE TRIGGER pagamento_atualizado_em');
    await client.query(`UPDATE pagamento SET atualizado_em = '2020-01-01T00:00:00Z' WHERE id = $1`, [id]);
    await client.query('ALTER TABLE pagamento ENABLE TRIGGER pagamento_atualizado_em');

    await client.query(`UPDATE pagamento SET status = 'RECUSADO' WHERE id = $1`, [id]);
    const { rows: [r] } = await client.query('SELECT atualizado_em > $2::timestamptz AS atualizou FROM pagamento WHERE id = $1', [id, '2020-01-01']);
    assert(r.atualizou, 'atualizado_em deveria ter sido renovado pelo UPDATE');
  });

  await teste('o trigger vence um atualizado_em informado à mão no UPDATE', async () => {
    const id = await criarReserva(client, ctx, { inicio: '2026-05-08T10:00:00Z', fim: '2026-05-08T12:00:00Z' });
    await client.query(`UPDATE reserva SET atualizado_em = '2001-01-01T00:00:00Z' WHERE id = $1`, [id]);
    const { rows: [r] } = await client.query(`SELECT atualizado_em > '2001-01-02'::timestamptz AS ok FROM reserva WHERE id = $1`, [id]);
    assert(r.ok, 'o valor informado deveria ter sido sobrescrito por now()');
  });
});
