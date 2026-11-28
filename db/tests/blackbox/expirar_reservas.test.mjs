// Testes de caixa-preta de expirar_reservas_vencidas() (migration 0008): chamam a função como o
// backend faz e só olham o resultado — o status das reservas e dos pagamentos, e se a bicicleta
// voltou a ficar livre.
//
// node tests/blackbox/expirar_reservas.test.mjs

import { rodarSuite } from '../suporte.mjs';
import { criarFixtures, criarReserva, criarPagamento } from '../fixtures.mjs';

await rodarSuite('blackbox/expirar_reservas', async (executor, client) => {
  const { teste, assert, comSavepoint } = executor;
  const ctx = await criarFixtures(client);

  // dentro da suíte now() não muda, então a idade da reserva é definida por criado_em
  async function reservaCriadaHaMinutos(minutos, overrides = {}) {
    const id = await criarReserva(client, ctx, overrides);
    await client.query(`UPDATE reserva SET criado_em = now() - make_interval(mins => $2) WHERE id = $1`, [id, minutos]);
    return id;
  }
  const statusDa = async (id) => (await client.query('SELECT status FROM reserva WHERE id = $1', [id])).rows[0].status;
  const statusDoPagamento = async (id) => (await client.query('SELECT status FROM pagamento WHERE id = $1', [id])).rows[0].status;
  const expirar = async () => (await client.query('SELECT expirar_reservas_vencidas() AS n')).rows[0].n;

  await teste('expira a pendente com 15 minutos ou mais, e devolve a contagem', () =>
    comSavepoint(async () => {
      const velha = await reservaCriadaHaMinutos(16, { status: 'PENDENTE_PAGAMENTO' });
      const limite = await reservaCriadaHaMinutos(15, {
        status: 'PENDENTE_PAGAMENTO', inicio: '2026-06-02T10:00:00Z', fim: '2026-06-02T12:00:00Z',
      });
      const n = await expirar();
      assert(n === 2, `esperava 2 expiradas, veio ${n}`);
      assert((await statusDa(velha)) === 'EXPIRADA', 'a de 16 minutos deveria expirar');
      assert((await statusDa(limite)) === 'EXPIRADA', 'a de exatamente 15 minutos deveria expirar');
    }));

  await teste('não mexe na pendente com menos de 15 minutos', () =>
    comSavepoint(async () => {
      const nova = await reservaCriadaHaMinutos(14, { status: 'PENDENTE_PAGAMENTO' });
      assert((await expirar()) === 0, 'não deveria expirar nada');
      assert((await statusDa(nova)) === 'PENDENTE_PAGAMENTO', 'a de 14 minutos deveria seguir pendente');
    }));

  await teste('só as pendentes expiram: confirmada, em andamento, concluída e cancelada ficam como estão', () =>
    comSavepoint(async () => {
      const casos = [
        ['CONFIRMADA', null], ['EM_ANDAMENTO', null], ['CONCLUIDA', null], ['CANCELADA', '2026-06-01T00:00:00Z'],
      ];
      const ids = [];
      for (const [i, [status, canceladaEm]] of casos.entries()) {
        ids.push([status, await reservaCriadaHaMinutos(120, {
          status, canceladaEm, inicio: `2026-06-1${i}T10:00:00Z`, fim: `2026-06-1${i}T12:00:00Z`,
        })]);
      }
      assert((await expirar()) === 0, 'não deveria expirar nenhuma');
      for (const [status, id] of ids) assert((await statusDa(id)) === status, `${status} foi alterada`);
    }));

  await teste('a bicicleta volta a ficar livre depois da expiração', () =>
    comSavepoint(async () => {
      await reservaCriadaHaMinutos(30, { status: 'PENDENTE_PAGAMENTO', inicio: '2026-06-20T10:00:00Z', fim: '2026-06-20T14:00:00Z' });
      await expirar();
      // o mesmo horário agora é aceito para outro cliente
      const id = await criarReserva(client, ctx, {
        clienteId: ctx.clienteBId, inicio: '2026-06-20T10:00:00Z', fim: '2026-06-20T14:00:00Z',
      });
      assert(id, 'a nova reserva deveria ser aceita');
    }));

  await teste('o pagamento PENDENTE da reserva expirada vira EXPIRADO; os de outras reservas não mudam', () =>
    comSavepoint(async () => {
      const velha = await reservaCriadaHaMinutos(20, { status: 'PENDENTE_PAGAMENTO' });
      const pagVelha = await criarPagamento(client, velha);
      const nova = await reservaCriadaHaMinutos(5, {
        status: 'PENDENTE_PAGAMENTO', inicio: '2026-06-03T10:00:00Z', fim: '2026-06-03T12:00:00Z',
      });
      const pagNova = await criarPagamento(client, nova);
      await expirar();
      assert((await statusDoPagamento(pagVelha)) === 'EXPIRADO', 'o pagamento da reserva expirada deveria expirar');
      assert((await statusDoPagamento(pagNova)) === 'PENDENTE', 'o pagamento da reserva nova não deveria mudar');
    }));

  await teste('reserva com pagamento APROVADO nunca expira, mesmo antes de virar CONFIRMADA', () =>
    comSavepoint(async () => {
      const id = await reservaCriadaHaMinutos(60, { status: 'PENDENTE_PAGAMENTO' });
      await criarPagamento(client, id, { status: 'APROVADO', pagoEm: '2026-06-01T10:00:00Z' });
      assert((await expirar()) === 0, 'não deveria expirar');
      assert((await statusDa(id)) === 'PENDENTE_PAGAMENTO', 'a reserva deveria seguir intacta');
    }));

  await teste('é idempotente: a segunda chamada seguida não expira nada', () =>
    comSavepoint(async () => {
      await reservaCriadaHaMinutos(40, { status: 'PENDENTE_PAGAMENTO' });
      assert((await expirar()) === 1, 'a primeira chamada deveria expirar 1');
      assert((await expirar()) === 0, 'a segunda não deveria expirar nada');
    }));

  await teste('um cliente (app_backend, perfil CLIENTE) expira também as reservas de outro cliente', () =>
    comSavepoint(async () => {
      const deB = await reservaCriadaHaMinutos(30, { status: 'PENDENTE_PAGAMENTO', clienteId: ctx.clienteBId });
      await client.query('SET ROLE app_backend');
      let n;
      try {
        await client.query(
          "SELECT set_config('app.perfil', 'CLIENTE', true), set_config('app.usuario_id', $1, true)",
          [ctx.clienteAId],
        );
        n = (await client.query('SELECT expirar_reservas_vencidas() AS n')).rows[0].n;
      } finally {
        await client.query('RESET ROLE');
      }
      assert(n === 1, `esperava 1 expirada, veio ${n} (a RLS não pode esconder reservas de outros da expiração)`);
      assert((await statusDa(deB)) === 'EXPIRADA', 'a reserva do cliente B deveria ter expirado');
    }));
});
