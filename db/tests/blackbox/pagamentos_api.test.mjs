// Integração do módulo pagamentos (rotas 16, 17 e 18): os casos de uso e o repositório REAIS
// (src/modules/pagamentos) contra o PostgreSQL, com o papel do app (SET ROLE app_backend + perfil
// CLIENTE) e a segurança por linha ligada. Só a Stripe é de mentira (nenhuma chamada de rede) e o
// HTTP fica de fora.
//
// node tests/blackbox/pagamentos_api.test.mjs

import { rodarSuite } from '../suporte.mjs';
import { criarFixtures, criarReserva } from '../fixtures.mjs';
import { PagarReservaService } from '../../../src/modules/pagamentos/application/pagar-reserva.ts';
import { IntervaloDeConsulta } from '../../../src/modules/pagamentos/application/intervalo-de-consulta.ts';
import { operacoesNoBanco } from '../../../src/modules/pagamentos/infrastructure/repositorio-pagamentos.ts';

const HORA = 60 * 60 * 1000;
const base = new Date(Date.now() + 3 * 24 * HORA);
base.setUTCMinutes(0, 0, 0);
const iso = (deslocaHoras) => new Date(base.getTime() + deslocaHoras * HORA).toISOString();

const nomeErro = (erro) => erro?.constructor?.name;

await rodarSuite('blackbox/pagamentos_api', async (executor, client) => {
  const { teste, assert, esperarErro } = executor;
  const ctx = await criarFixtures(client);
  const sessaoA = { perfil: 'CLIENTE', usuarioId: ctx.clienteAId };
  const sessaoB = { perfil: 'CLIENTE', usuarioId: ctx.clienteBId };

  // Imita o comSessao do app sobre a transação da suíte (papel do app, sessão declarada, savepoint).
  async function transacao(sessao, fn) {
    await client.query('SET ROLE app_backend');
    await client.query('SAVEPOINT caso_de_uso');
    try {
      await client.query(
        "SELECT set_config('app.perfil', $1, true), set_config('app.usuario_id', $2, true)",
        [sessao.perfil ?? '', sessao.usuarioId ?? ''],
      );
      const resultado = await fn(operacoesNoBanco(client));
      await client.query('RELEASE SAVEPOINT caso_de_uso');
      return resultado;
    } catch (erro) {
      await client.query('ROLLBACK TO SAVEPOINT caso_de_uso');
      throw erro;
    } finally {
      await client.query("SELECT set_config('app.perfil', '', true), set_config('app.usuario_id', '', true)");
      await client.query('RESET ROLE');
    }
  }

  // Stripe de mentira
  let seq = 0;
  const naStripe = new Map();
  const estornos = [];
  let stripeFora = false;
  const gateway = {
    async criarCobrancaPix() {
      if (stripeFora) throw Object.assign(new Error('Stripe fora'), { name: 'PagamentoIndisponivelError' });
      const idExterno = `pi_teste_${++seq}_${Date.now()}`;
      naStripe.set(idExterno, 'pendente');
      return { idExterno, copiaECola: `00020126-${idExterno}` };
    },
    async consultar(id) {
      return naStripe.get(id) ?? 'pendente';
    },
    async estornar(id) {
      estornos.push(id);
    },
    async cancelar(id) {
      naStripe.set(id, 'expirado');
    },
  };

  // O aviso chega sem sessão: a função do banco (SECURITY DEFINER) diz de quem é a cobrança.
  async function clienteDoPagamento(idExterno) {
    await client.query('SET ROLE app_backend');
    try {
      const { rows } = await client.query('SELECT cliente_do_pagamento($1) AS id', [idExterno]);
      return rows[0].id;
    } finally {
      await client.query('RESET ROLE');
    }
  }

  const deps = {
    transacao,
    agora: () => new Date(),
    gerarId: () => crypto.randomUUID(),
    gerarQrCode: async (t) => `png:${t}`,
    gateway: () => gateway,
    clienteDoPagamento,
    // nos testes a rota 17 pergunta à Stripe toda vez
    intervaloDeConsulta: new IntervaloDeConsulta(0),
  };
  const servico = new PagarReservaService(deps);
  const iniciar = (sessao, corpo) => servico.iniciar(sessao, corpo);
  const status = (sessao, id) => servico.consultarStatus(sessao, id);
  const aviso = (id, situacao) => servico.processarAviso(id, situacao);

  const reservaPendente = (clienteId = ctx.clienteAId, desloca = 0) =>
    criarReserva(client, ctx, {
      clienteId,
      status: 'PENDENTE_PAGAMENTO',
      inicio: iso(desloca),
      fim: iso(desloca + 4),
      valorAluguelCentavos: 4000,
    });

  const linhaPagamento = async (id) =>
    (await client.query('SELECT * FROM pagamento WHERE id = $1', [id])).rows[0];
  const statusReserva = async (id) =>
    (await client.query('SELECT status FROM reserva WHERE id = $1', [id])).rows[0].status;

  await teste('rota 16 grava o Pix com o id e o copia e cola da Stripe; pedir de novo reaproveita', async () => {
    const reservaId = await reservaPendente();
    const a = await iniciar(sessaoA, { reservaId, metodo: 'PIX' });
    assert(a.criada, 'a primeira cobrança é nova (201)');
    const linha = await linhaPagamento(a.cobranca.pagamentoId);
    assert(linha.status === 'PENDENTE', 'pendente');
    assert(linha.mp_payment_id.startsWith('pi_teste_'), 'id do PaymentIntent gravado');
    assert(linha.qr_code_pix === a.cobranca.pix.copiaECola, 'copia e cola gravado');
    assert(linha.valor_centavos === 4000, 'cobra só o aluguel');
    assert(linha.pix_expira_em !== null, 'prazo do Pix gravado');

    const b = await iniciar(sessaoA, { reservaId, metodo: 'PIX' });
    assert(!b.criada && b.cobranca.pagamentoId === a.cobranca.pagamentoId, 'reaproveitou o pendente (200)');
    assert(b.cobranca.pix.copiaECola === a.cobranca.pix.copiaECola, 'mesmo copia e cola, lido do banco');
  });

  await teste('o cliente B não cobra a reserva do cliente A (404, a RLS esconde)', async () => {
    const reservaId = await reservaPendente();
    try {
      await iniciar(sessaoB, { reservaId, metodo: 'PIX' });
      throw new Error('aceitou');
    } catch (erro) {
      assert(nomeErro(erro) === 'NotFoundError', `esperava 404, veio ${nomeErro(erro)}: ${erro.message}`);
    }
    try {
      await status(sessaoB, reservaId);
      throw new Error('aceitou');
    } catch (erro) {
      assert(nomeErro(erro) === 'NotFoundError', `status: esperava 404, veio ${nomeErro(erro)}`);
    }
  });

  // Achado do teste de estresse: com a DATABASE_URL do dono do banco (ambiente local), a RLS não vale
  // e o cliente B gerava o Pix da reserva do cliente A. Aqui a transação roda SEM o SET ROLE (como o
  // dono): só o filtro pelo cliente da sessão, no SQL do repositório, segura o acesso.
  async function transacaoSemRls(sessao, fn) {
    await client.query('SAVEPOINT sem_rls');
    try {
      await client.query(
        "SELECT set_config('app.perfil', $1, true), set_config('app.usuario_id', $2, true)",
        [sessao.perfil, sessao.usuarioId],
      );
      const resultado = await fn(operacoesNoBanco(client));
      await client.query('RELEASE SAVEPOINT sem_rls');
      return resultado;
    } catch (erro) {
      await client.query('ROLLBACK TO SAVEPOINT sem_rls');
      throw erro;
    } finally {
      await client.query("SELECT set_config('app.perfil', '', true), set_config('app.usuario_id', '', true)");
    }
  }

  await teste('mesmo sem a RLS (papel dono do banco), o cliente B não cobra nem vê o Pix do cliente A', async () => {
    const depsSemRls = { ...deps, transacao: transacaoSemRls };
    const reservaId = await reservaPendente();
    const pixDeA = await criarIniciarPagamento(depsSemRls)(sessaoA, { reservaId, metodo: 'PIX' });
    assert(pixDeA.criada, 'o dono da reserva cobra normalmente sem a RLS');

    for (const [nome, chamada] of [
      ['cobrar', () => criarIniciarPagamento(depsSemRls)(sessaoB, { reservaId, metodo: 'PIX' })],
      ['ver o status', () => criarConsultarStatus(depsSemRls)(sessaoB, reservaId)],
    ]) {
      try {
        await chamada();
        throw new Error(`${nome}: aceitou`);
      } catch (erro) {
        assert(nomeErro(erro) === 'NotFoundError', `${nome}: esperava 404, veio ${nomeErro(erro)}: ${erro.message}`);
      }
    }

    const idExterno = (await linhaPagamento(pixDeA.cobranca.pagamentoId)).mp_payment_id;
    const deB = await transacaoSemRls(sessaoB, async (op) => ({
      pendente: await op.buscarPendenteDaReserva(reservaId),
      porId: await op.buscarPorId(pixDeA.cobranca.pagamentoId),
      porIdExterno: await op.travarPorIdExterno(idExterno),
      reserva: await op.travarReserva(reservaId),
      confirmou: await op.confirmarReserva(reservaId),
    }));
    assert(deB.pendente === null && deB.porId === null && deB.porIdExterno === null, 'B não lê o pagamento de A');
    assert(deB.reserva === null, 'B não trava a reserva de A');
    assert(deB.confirmou === false, 'B não confirma a reserva de A');
    assert((await statusReserva(reservaId)) === 'PENDENTE_PAGAMENTO', 'a reserva de A continua como estava');
  });

  await teste('Stripe fora do ar: nada é gravado', async () => {
    const reservaId = await reservaPendente();
    stripeFora = true;
    try {
      await iniciar(sessaoA, { reservaId, metodo: 'PIX' });
      throw new Error('aceitou');
    } catch (erro) {
      assert(erro.message === 'Stripe fora', `veio ${erro.message}`);
    } finally {
      stripeFora = false;
    }
    const { rowCount } = await client.query('SELECT 1 FROM pagamento WHERE reserva_id = $1', [reservaId]);
    assert(rowCount === 0, 'sem pagamento gravado');
  });

  await teste('índice: a mesma reserva não tem dois pagamentos PENDENTE/APROVADO', async () => {
    const reservaId = await reservaPendente();
    await iniciar(sessaoA, { reservaId, metodo: 'PIX' });
    await esperarErro(
      () =>
        client.query(
          `INSERT INTO pagamento (reserva_id, metodo, valor_centavos, status) VALUES ($1, 'PIX', 4000, 'PENDENTE')`,
          [reservaId],
        ),
      '23505',
      'pagamento_um_ativo_por_reserva',
    );
  });

  await teste('rota 17: Pix pago na Stripe aprova o pagamento e confirma a reserva', async () => {
    const reservaId = await reservaPendente();
    const { cobranca } = await iniciar(sessaoA, { reservaId, metodo: 'PIX' });
    const antes = await status(sessaoA, reservaId);
    assert(antes.statusPagamento === 'PENDENTE' && antes.statusReserva === 'PENDENTE_PAGAMENTO', 'ainda pendente');

    const idExterno = (await linhaPagamento(cobranca.pagamentoId)).mp_payment_id;
    naStripe.set(idExterno, 'aprovado');
    const depois = await status(sessaoA, reservaId);
    assert(depois.statusPagamento === 'APROVADO', `pagamento ${depois.statusPagamento}`);
    assert(depois.statusReserva === 'CONFIRMADA', `reserva ${depois.statusReserva}`);
    const linha = await linhaPagamento(cobranca.pagamentoId);
    assert(linha.pago_em !== null, 'pago_em preenchido no APROVADO');
  });

  await teste('rota 18: aviso aprovado confirma; o mesmo aviso de novo é ignorado', async () => {
    const reservaId = await reservaPendente();
    const { cobranca } = await iniciar(sessaoA, { reservaId, metodo: 'PIX' });
    const idExterno = (await linhaPagamento(cobranca.pagamentoId)).mp_payment_id;
    assert((await clienteDoPagamento(idExterno)) === ctx.clienteAId, 'cliente_do_pagamento acha o dono');
    assert((await aviso(idExterno, 'aprovado')) === 'confirmado', 'confirmou');
    assert((await statusReserva(reservaId)) === 'CONFIRMADA', 'reserva confirmada');
    assert((await aviso(idExterno, 'aprovado')) === 'ignorado', 'idempotente');
  });

  await teste('rota 18: pago depois do cancelamento é estornado (ESTORNADO, sem pago_em)', async () => {
    const reservaId = await reservaPendente();
    const { cobranca } = await iniciar(sessaoA, { reservaId, metodo: 'PIX' });
    const idExterno = (await linhaPagamento(cobranca.pagamentoId)).mp_payment_id;
    await client.query(`UPDATE reserva SET status = 'CANCELADA', cancelada_em = now() WHERE id = $1`, [reservaId]);
    assert((await aviso(idExterno, 'aprovado')) === 'estornado', 'estornou');
    assert(estornos.includes(idExterno), 'pediu o estorno à Stripe');
    const linha = await linhaPagamento(cobranca.pagamentoId);
    assert(linha.status === 'ESTORNADO' && linha.pago_em === null, `ficou ${linha.status}`);
  });

  await teste('rota 18: cobrança desconhecida é ignorada', async () => {
    assert((await clienteDoPagamento('pi_nao_existe')) === null, 'sem dono');
    assert((await aviso('pi_nao_existe', 'aprovado')) === 'ignorado', 'ignorado');
  });

  await teste('rota 18: Pix pago no último segundo, aviso depois de expirar_reservas_vencidas(): ESTORNADO', async () => {
    const reservaId = await reservaPendente();
    const { cobranca } = await iniciar(sessaoA, { reservaId, metodo: 'PIX' });
    const idExterno = (await linhaPagamento(cobranca.pagamentoId)).mp_payment_id;
    // a reserva venceu e a função real do banco expirou a reserva E o pagamento
    await client.query(`UPDATE reserva SET criado_em = now() - interval '20 minutes' WHERE id = $1`, [reservaId]);
    await client.query('SELECT expirar_reservas_vencidas()');
    assert((await linhaPagamento(cobranca.pagamentoId)).status === 'EXPIRADO', 'o banco expirou o pagamento');
    assert((await aviso(idExterno, 'aprovado')) === 'estornado', 'estornou');
    assert(estornos.includes(idExterno), 'pediu o estorno à Stripe');
    const linha = await linhaPagamento(cobranca.pagamentoId);
    assert(linha.status === 'ESTORNADO' && linha.pago_em === null, `ficou ${linha.status}`);
    assert((await aviso(idExterno, 'aprovado')) === 'ignorado', 'não estorna duas vezes');
  });
});
