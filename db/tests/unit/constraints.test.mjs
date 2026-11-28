// Testes unitários das constraints da migration 0006 (reserva e pagamento): cada teste viola
// (ou confirma que não viola) exatamente UMA regra, com o resto dos dados válido. Verificam o
// SQLSTATE e, quando aplicável, o nome da constraint violada — por isso "unitário" aqui também é
// caixa-branca: conhece os nomes que a migration deu a cada constraint.
//
// node tests/unit/constraints.test.mjs

import { rodarSuite } from '../suporte.mjs';
import { criarFixtures, criarReserva, criarPagamento } from '../fixtures.mjs';

await rodarSuite('unit/constraints', async (executor, client) => {
  const { teste, assert, esperarErro } = executor;
  const ctx = await criarFixtures(client);

  // -------------------------------------------------------------------------
  // reserva_periodo_formato
  // -------------------------------------------------------------------------
  await teste('reserva_periodo_formato rejeita período vazio (início = fim)', () =>
    esperarErro(
      () => criarReserva(client, ctx, {
        periodoSql: `tstzrange('2026-04-01T10:00:00Z'::timestamptz, '2026-04-01T10:00:00Z'::timestamptz, '[)')`,
      }),
      '23514',
      'reserva_periodo_formato',
    ));

  await teste('reserva_periodo_formato rejeita limite inferior exclusivo', () =>
    esperarErro(
      () => criarReserva(client, ctx, {
        periodoSql: `tstzrange('2026-04-01T10:00:00Z'::timestamptz, '2026-04-01T14:00:00Z'::timestamptz, '()')`,
      }),
      '23514',
      'reserva_periodo_formato',
    ));

  await teste('reserva_periodo_formato rejeita limite superior inclusivo', () =>
    esperarErro(
      () => criarReserva(client, ctx, {
        periodoSql: `tstzrange('2026-04-01T10:00:00Z'::timestamptz, '2026-04-01T14:00:00Z'::timestamptz, '[]')`,
      }),
      '23514',
      'reserva_periodo_formato',
    ));

  await teste('reserva_periodo_formato aceita o formato canônico [início, fim)', async () => {
    const id = await criarReserva(client, ctx, { inicio: '2026-04-02T10:00:00Z', fim: '2026-04-02T14:00:00Z' });
    assert(id, 'a reserva deveria ter sido criada');
  });

  // -------------------------------------------------------------------------
  // reserva_valores_validos
  // -------------------------------------------------------------------------
  await teste('reserva_valores_validos rejeita valor_aluguel_centavos negativo', () =>
    esperarErro(
      () => criarReserva(client, ctx, { valorAluguelCentavos: -1 }),
      '23514',
      'reserva_valores_validos',
    ));

  await teste('reserva_valores_validos rejeita valor_caucao_centavos negativo', () =>
    esperarErro(
      () => criarReserva(client, ctx, { valorCaucaoCentavos: -1 }),
      '23514',
      'reserva_valores_validos',
    ));

  // -------------------------------------------------------------------------
  // reserva_cancelada_em_consistente
  // -------------------------------------------------------------------------
  await teste('reserva_cancelada_em_consistente rejeita CANCELADA sem cancelada_em', () =>
    esperarErro(
      () => criarReserva(client, ctx, { status: 'CANCELADA', canceladaEm: null }),
      '23514',
      'reserva_cancelada_em_consistente',
    ));

  await teste('reserva_cancelada_em_consistente rejeita cancelada_em fora de CANCELADA', () =>
    esperarErro(
      () => criarReserva(client, ctx, { status: 'CONFIRMADA', canceladaEm: new Date() }),
      '23514',
      'reserva_cancelada_em_consistente',
    ));

  // -------------------------------------------------------------------------
  // reserva_codigo_unico
  // -------------------------------------------------------------------------
  await teste('reserva_codigo_unico rejeita código repetido', async () => {
    await criarReserva(client, ctx, {
      codigo: 'RES-UNIT-DUPLICADO',
      inicio: '2026-04-03T10:00:00Z',
      fim: '2026-04-03T12:00:00Z',
    });
    await esperarErro(
      () => criarReserva(client, ctx, {
        codigo: 'RES-UNIT-DUPLICADO',
        inicio: '2026-04-04T10:00:00Z',
        fim: '2026-04-04T12:00:00Z',
      }),
      '23505',
      'reserva_codigo_unico',
    );
  });

  // -------------------------------------------------------------------------
  // reserva_*_fkey (integridade referencial)
  // -------------------------------------------------------------------------
  await teste('a FK de bicicleta_id rejeita uma bicicleta inexistente', () =>
    esperarErro(
      () => criarReserva(client, ctx, { bicicletaId: '00000000-0000-0000-0000-000000000000' }),
      '23503',
    ));

  // -------------------------------------------------------------------------
  // enum status_reserva
  // -------------------------------------------------------------------------
  await teste('status aceita apenas os valores do enum status_reserva', () =>
    esperarErro(
      () => criarReserva(client, ctx, { status: 'NAO_EXISTE' }),
      '22P02',
    ));

  // -------------------------------------------------------------------------
  // pagamento_valor_valido
  // -------------------------------------------------------------------------
  await teste('pagamento_valor_valido rejeita valor_centavos negativo', async () => {
    const reservaId = await criarReserva(client, ctx);
    await esperarErro(
      () => criarPagamento(client, reservaId, { valorCentavos: -1 }),
      '23514',
      'pagamento_valor_valido',
    );
  });

  // -------------------------------------------------------------------------
  // pagamento_pago_em_consistente
  // -------------------------------------------------------------------------
  await teste('pagamento_pago_em_consistente rejeita APROVADO sem pago_em', async () => {
    const reservaId = await criarReserva(client, ctx);
    await esperarErro(
      () => criarPagamento(client, reservaId, { status: 'APROVADO', pagoEm: null }),
      '23514',
      'pagamento_pago_em_consistente',
    );
  });

  await teste('pagamento_pago_em_consistente rejeita pago_em fora de APROVADO', async () => {
    const reservaId = await criarReserva(client, ctx);
    await esperarErro(
      () => criarPagamento(client, reservaId, { status: 'PENDENTE', pagoEm: new Date() }),
      '23514',
      'pagamento_pago_em_consistente',
    );
  });

  // -------------------------------------------------------------------------
  // pagamento_mp_payment_id_unico
  // -------------------------------------------------------------------------
  await teste('pagamento_mp_payment_id_unico rejeita mp_payment_id repetido', async () => {
    const reserva1 = await criarReserva(client, ctx, { inicio: '2026-04-05T10:00:00Z', fim: '2026-04-05T12:00:00Z' });
    const reserva2 = await criarReserva(client, ctx, { inicio: '2026-04-06T10:00:00Z', fim: '2026-04-06T12:00:00Z' });
    await criarPagamento(client, reserva1, { mpPaymentId: 'MP-UNIT-DUPLICADO' });
    await esperarErro(
      () => criarPagamento(client, reserva2, { mpPaymentId: 'MP-UNIT-DUPLICADO' }),
      '23505',
      'pagamento_mp_payment_id_unico',
    );
  });

  await teste('pagamento_mp_payment_id_unico aceita vários pagamentos com mp_payment_id nulo', async () => {
    const reserva1 = await criarReserva(client, ctx, { inicio: '2026-04-07T10:00:00Z', fim: '2026-04-07T12:00:00Z' });
    const reserva2 = await criarReserva(client, ctx, { inicio: '2026-04-08T10:00:00Z', fim: '2026-04-08T12:00:00Z' });
    await criarPagamento(client, reserva1, { mpPaymentId: null });
    await criarPagamento(client, reserva2, { mpPaymentId: null }); // não deve lançar
  });
});
