// Isolamento entre clientes pela RLS de reserva e pagamento (tarefa S7).
//
// Complementa blackbox/reserva_e_pagamento (que só confere a LEITURA de reserva) e
// blackbox/criar_reserva (que cobre a view reserva_detalhada). Aqui entram o pagamento, as
// ESCRITAS entre clientes, o visitante, perfis desconhecidos e a equipe, nas duas tabelas.
//
// Como as outras suítes, roda com SET ROLE app_backend e a sessão declarada em app.perfil e
// app.usuario_id (o que o comSessao do app faz), dentro da transação da suíte, com ROLLBACK no
// final. Isto NÃO prova a conexão real com o papel app_login (CT-BD-04): isso depende da string
// de conexão desse papel, que é do tech lead. app_login é um papel com login que herda
// app_backend e não tem BYPASSRLS, então as mesmas políticas valem para ele.
//
// Todo caso negativo tem um controle positivo (a mesma operação, feita pelo dono da linha,
// funciona), para o teste não passar por motivo errado (dado inválido, constraint etc.).
//
// node tests/blackbox/isolamento_rls.test.mjs

import { rodarSuite } from '../suporte.mjs';
import { criarFixtures, criarOperador, criarPagamento, criarReserva } from '../fixtures.mjs';

await rodarSuite('blackbox/isolamento_rls', async (executor, client) => {
  const { teste, assert, comSavepoint, esperarErro } = executor;
  const ctx = await criarFixtures(client);

  // segunda bicicleta do mesmo tipo, para a reserva do cliente B
  const { rows: [b2] } = await client.query(
    `INSERT INTO bicicleta (tipo_id, ponto_id, codigo) VALUES ($1, $2, 'BIC-TESTE-RLS-2') RETURNING id`,
    [ctx.tipoId, ctx.pontoId],
  );
  const operadorId = await criarOperador(client, 'teste-rls-operador@bikeilha.test');

  // dados de partida (como dono do banco): cada cliente com uma reserva e um pagamento
  const reservaA = await criarReserva(client, ctx, {
    clienteId: ctx.clienteAId,
    inicio: '2026-08-10T10:00:00Z',
    fim: '2026-08-10T14:00:00Z',
  });
  const reservaB = await criarReserva(client, ctx, {
    clienteId: ctx.clienteBId,
    bicicletaId: b2.id,
    inicio: '2026-08-11T10:00:00Z',
    fim: '2026-08-11T14:00:00Z',
  });
  const pagamentoA = await criarPagamento(client, reservaA, { status: 'PENDENTE' });
  const pagamentoB = await criarPagamento(client, reservaB, { status: 'PENDENTE' });

  const clienteA = { perfil: 'CLIENTE', usuarioId: ctx.clienteAId };
  const clienteB = { perfil: 'CLIENTE', usuarioId: ctx.clienteBId };
  const visitante = { perfil: '', usuarioId: '' };
  const operador = { perfil: 'OPERADOR', usuarioId: operadorId };
  const admin = { perfil: 'ADMIN', usuarioId: '' };

  // Roda fn como o app: papel app_backend e sessão declarada. Se fn falhar (erro esperado, como
  // 42501), a transação da suíte continua utilizável, o papel volta ao normal e a sessão é
  // limpa para não vazar para o próximo teste.
  async function como(sessao, fn) {
    await client.query('SET ROLE app_backend');
    try {
      await client.query(
        "SELECT set_config('app.perfil', $1, true), set_config('app.usuario_id', $2, true)",
        [sessao.perfil, sessao.usuarioId ?? ''],
      );
      await client.query('SAVEPOINT como_sessao');
      try {
        const resultado = await fn();
        await client.query('RELEASE SAVEPOINT como_sessao');
        return resultado;
      } catch (erro) {
        await client.query('ROLLBACK TO SAVEPOINT como_sessao');
        throw erro;
      }
    } finally {
      await client.query('RESET ROLE');
      await client.query("SELECT set_config('app.perfil', '', true), set_config('app.usuario_id', '', true)");
    }
  }

  // ids (entre os pedidos) que a sessão consegue ler na tabela
  const visiveis = (sessao, tabela, pedidos) =>
    como(sessao, async () =>
      (await client.query(`SELECT id FROM ${tabela} WHERE id = ANY($1::uuid[])`, [pedidos])).rows
        .map((r) => r.id)
        .sort());
  const ordenado = (...ids) => [...ids].sort();
  const mesmos = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const inserirReserva = (clienteId, codigo, bicicletaId, inicio, fim) =>
    client.query(
      `INSERT INTO reserva
         (codigo, cliente_id, bicicleta_id, ponto_id, periodo, status,
          valor_aluguel_centavos, valor_caucao_centavos)
       VALUES ($1, $2, $3, $4, tstzrange($5::timestamptz, $6::timestamptz, '[)'),
               'PENDENTE_PAGAMENTO', 5000, 0)`,
      [codigo, clienteId, bicicletaId, ctx.pontoId, inicio, fim],
    );

  const inserirPagamento = (reservaId) =>
    client.query(
      `INSERT INTO pagamento (reserva_id, metodo, valor_centavos, status)
       VALUES ($1, 'PIX', 5000, 'RECUSADO')`,
      [reservaId],
    );

  // ------------------------------------------------------------------ leitura

  await teste('cada cliente lê o próprio pagamento e não vê o do outro', () =>
    comSavepoint(async () => {
      const pedidos = [pagamentoA, pagamentoB];
      assert(mesmos(await visiveis(clienteA, 'pagamento', pedidos), [pagamentoA]), 'o cliente A deveria ver só o próprio pagamento');
      assert(mesmos(await visiveis(clienteB, 'pagamento', pedidos), [pagamentoB]), 'o cliente B deveria ver só o próprio pagamento');
    }));

  await teste('o cliente não vê pagamento de reserva alheia nem consultando pela reserva', () =>
    comSavepoint(async () => {
      const { rowCount } = await como(clienteA, () =>
        client.query('SELECT id FROM pagamento WHERE reserva_id = $1', [reservaB]));
      assert(rowCount === 0, 'o cliente A não deveria ver o pagamento da reserva do cliente B');
      const { rowCount: propria } = await como(clienteA, () =>
        client.query('SELECT id FROM pagamento WHERE reserva_id = $1', [reservaA]));
      assert(propria === 1, 'controle: o cliente A deveria ver o pagamento da própria reserva');
    }));

  await teste('visitante (sem sessão) não vê reserva nem pagamento', () =>
    comSavepoint(async () => {
      assert((await visiveis(visitante, 'reserva', [reservaA, reservaB])).length === 0, 'visitante não deveria ver reservas');
      assert((await visiveis(visitante, 'pagamento', [pagamentoA, pagamentoB])).length === 0, 'visitante não deveria ver pagamentos');
    }));

  await teste('perfil desconhecido, em minúsculas ou cliente sem usuário não veem nada', () =>
    comSavepoint(async () => {
      const sessoes = [
        { perfil: 'ADMIN_PLATAFORMA', usuarioId: ctx.clienteAId },
        { perfil: 'GERENTE_LOCADORA', usuarioId: ctx.clienteAId },
        { perfil: 'cliente', usuarioId: ctx.clienteAId },
        { perfil: 'CLIENTE', usuarioId: '' },
      ];
      for (const sessao of sessoes) {
        const r = await visiveis(sessao, 'reserva', [reservaA, reservaB]);
        const p = await visiveis(sessao, 'pagamento', [pagamentoA, pagamentoB]);
        assert(r.length === 0 && p.length === 0, `perfil "${sessao.perfil}" não deveria ver nada (reservas ${r.length}, pagamentos ${p.length})`);
      }
    }));

  await teste('operador e administrador veem as reservas e os pagamentos de todos', () =>
    comSavepoint(async () => {
      for (const [nome, sessao] of [['operador', operador], ['administrador', admin]]) {
        assert(
          mesmos(await visiveis(sessao, 'reserva', [reservaA, reservaB]), ordenado(reservaA, reservaB)),
          `${nome} deveria ver as duas reservas`,
        );
        assert(
          mesmos(await visiveis(sessao, 'pagamento', [pagamentoA, pagamentoB]), ordenado(pagamentoA, pagamentoB)),
          `${nome} deveria ver os dois pagamentos`,
        );
      }
    }));

  // ------------------------------------------------------------------ escrita

  await teste('o cliente não consegue alterar a reserva nem o pagamento de outro cliente', () =>
    comSavepoint(async () => {
      const cancelarReserva = (id) =>
        client.query(`UPDATE reserva SET status = 'CANCELADA', cancelada_em = now() WHERE id = $1`, [id]);
      const recusarPagamento = (id) =>
        client.query(`UPDATE pagamento SET status = 'RECUSADO' WHERE id = $1`, [id]);

      // a RLS não dá erro no UPDATE: a linha alheia some do alcance e 0 linhas são alteradas
      assert((await como(clienteA, () => cancelarReserva(reservaB))).rowCount === 0, 'o cliente A alterou a reserva do cliente B');
      assert((await como(clienteA, () => recusarPagamento(pagamentoB))).rowCount === 0, 'o cliente A alterou o pagamento do cliente B');

      // controle: nas próprias linhas a mesma operação funciona. Atenção: o controle do pagamento só
      // prova que a política ATUAL deixa o cliente alterar o próprio pagamento (é o servidor quem muda
      // o status, com a sessão do cliente). Não é uma regra desejada: se um dia a política for apertada
      // para só o servidor mudar o status, ajuste este controle junto.
      assert((await como(clienteA, () => cancelarReserva(reservaA))).rowCount === 1, 'controle: o cliente A deveria cancelar a própria reserva');
      assert((await como(clienteA, () => recusarPagamento(pagamentoA))).rowCount === 1, 'controle: o cliente A deveria alterar o próprio pagamento');

      // conferência como dono do banco: nada mudou do lado do cliente B
      const { rows: [r] } = await client.query('SELECT status FROM reserva WHERE id = $1', [reservaB]);
      const { rows: [p] } = await client.query('SELECT status FROM pagamento WHERE id = $1', [pagamentoB]);
      assert(r.status === 'CONFIRMADA', `a reserva do cliente B mudou para ${r.status}`);
      assert(p.status === 'PENDENTE', `o pagamento do cliente B mudou para ${p.status}`);
    }));

  await teste('o cliente não consegue criar reserva em nome de outro cliente', () =>
    comSavepoint(async () => {
      await esperarErro(
        () => como(clienteA, () => inserirReserva(ctx.clienteBId, 'RES-TESTE-RLS-1', ctx.bicicletaId, '2026-08-20T10:00:00Z', '2026-08-20T14:00:00Z')),
        '42501',
      );
      // controle: em nome próprio, o mesmo INSERT funciona
      const { rowCount } = await como(clienteA, () =>
        inserirReserva(ctx.clienteAId, 'RES-TESTE-RLS-2', ctx.bicicletaId, '2026-08-21T10:00:00Z', '2026-08-21T14:00:00Z'));
      assert(rowCount === 1, 'controle: o cliente A deveria criar a própria reserva');
    }));

  await teste('o cliente não consegue registrar pagamento em reserva de outro cliente', () =>
    comSavepoint(async () => {
      await esperarErro(() => como(clienteA, () => inserirPagamento(reservaB)), '42501');
      // controle: na própria reserva, o mesmo INSERT funciona
      const { rowCount } = await como(clienteA, () => inserirPagamento(reservaA));
      assert(rowCount === 1, 'controle: o cliente A deveria registrar pagamento na própria reserva');
    }));

  await teste('o cliente não consegue passar a própria reserva para outro cliente', () =>
    comSavepoint(async () => {
      await esperarErro(
        () => como(clienteA, () => client.query('UPDATE reserva SET cliente_id = $2 WHERE id = $1', [reservaA, ctx.clienteBId])),
        '42501',
      );
      const { rows: [r] } = await client.query('SELECT cliente_id FROM reserva WHERE id = $1', [reservaA]);
      assert(r.cliente_id === ctx.clienteAId, 'a reserva do cliente A mudou de dono');
    }));

  await teste('visitante não consegue criar nem alterar reserva e pagamento', () =>
    comSavepoint(async () => {
      await esperarErro(
        () => como(visitante, () => inserirReserva(ctx.clienteAId, 'RES-TESTE-RLS-3', ctx.bicicletaId, '2026-08-22T10:00:00Z', '2026-08-22T14:00:00Z')),
        '42501',
      );
      await esperarErro(() => como(visitante, () => inserirPagamento(reservaA)), '42501');
      assert(
        (await como(visitante, () => client.query(`UPDATE pagamento SET status = 'RECUSADO' WHERE id = $1`, [pagamentoA]))).rowCount === 0,
        'visitante alterou um pagamento',
      );
    }));

  // Duas barreiras seguram este caso: o WITH CHECK de pagamento_cliente e, como o UPDATE tem WHERE e
  // precisa ler a linha, o USING da mesma política aplicado à linha nova. Tirar só o WITH CHECK não
  // abre o buraco; o teste falha quando as duas deixam passar (conferido sabotando as políticas).
  await teste('o cliente não consegue mover o próprio pagamento para a reserva de outro', () =>
    comSavepoint(async () => {
      await esperarErro(
        () => como(clienteA, () => client.query('UPDATE pagamento SET reserva_id = $2 WHERE id = $1', [pagamentoA, reservaB])),
        '42501',
      );
      const { rows: [p] } = await client.query('SELECT reserva_id FROM pagamento WHERE id = $1', [pagamentoA]);
      assert(p.reserva_id === reservaA, 'o pagamento do cliente A mudou de reserva');
    }));

  await teste('o cliente não consegue apagar reserva nem pagamento (nem os próprios)', () =>
    comSavepoint(async () => {
      for (const [tabela, id] of [['reserva', reservaB], ['pagamento', pagamentoB], ['pagamento', pagamentoA]]) {
        await esperarErro(() => como(clienteA, () => client.query(`DELETE FROM ${tabela} WHERE id = $1`, [id])), '42501');
      }
      const { rowCount } = await client.query('SELECT 1 FROM pagamento WHERE id = ANY($1::uuid[])', [[pagamentoA, pagamentoB]]);
      assert(rowCount === 2, 'algum pagamento sumiu');
    }));
});
