// Testes de caixa-preta da migration 0010: escolher_unidade_para_reserva() (escolha da unidade
// na criação da reserva) e a view reserva_detalhada (leitura das reservas pelo cliente).
// Tudo roda com o papel do app (SET ROLE app_backend + perfil CLIENTE), como o backend faz:
// o dono do banco ignora a RLS e esconderia os problemas que estas peças resolvem.
//
// node tests/blackbox/criar_reserva.test.mjs

import pg from 'pg';
import { conectar, rodarSuite } from '../suporte.mjs';
import { criarFixtures, criarReserva } from '../fixtures.mjs';

const INICIO = '2026-07-10T10:00:00Z';
const FIM = '2026-07-10T14:00:00Z';

await rodarSuite('blackbox/criar_reserva', async (executor, client) => {
  const { teste, assert, comSavepoint } = executor;
  const ctx = await criarFixtures(client);

  // segunda unidade do mesmo tipo (a fixture traz uma só)
  const { rows: [b2] } = await client.query(
    `INSERT INTO bicicleta (tipo_id, ponto_id, codigo) VALUES ($1, $2, 'BIC-TESTE-RESERVA-2') RETURNING id`,
    [ctx.tipoId, ctx.pontoId],
  );

  // roda fn como o app: papel app_backend, perfil e usuário declarados
  async function comoCliente(clienteId, fn) {
    await client.query('SET ROLE app_backend');
    try {
      await client.query(
        "SELECT set_config('app.perfil', 'CLIENTE', true), set_config('app.usuario_id', $1, true)",
        [clienteId],
      );
      // savepoint próprio: se fn falhar (erro esperado, como 22023), a transação da suíte
      // continua utilizável e o RESET ROLE abaixo roda
      await client.query('SAVEPOINT como_cliente');
      try {
        const resultado = await fn();
        await client.query('RELEASE SAVEPOINT como_cliente');
        return resultado;
      } catch (erro) {
        await client.query('ROLLBACK TO SAVEPOINT como_cliente');
        throw erro;
      }
    } finally {
      await client.query('RESET ROLE');
    }
  }
  const escolher = (clienteId, excluir = [], inicio = INICIO, fim = FIM, tipoId = ctx.tipoId) =>
    comoCliente(clienteId, async () =>
      (await client.query(
        'SELECT bicicleta_id, ponto_id FROM escolher_unidade_para_reserva($1, $2, $3, $4::uuid[])',
        [tipoId, inicio, fim, excluir],
      )).rows[0] ?? null);

  await teste('escolhe a unidade livre do tipo, em ordem de código, e devolve o ponto', () =>
    comSavepoint(async () => {
      const u = await escolher(ctx.clienteAId);
      assert(u && u.bicicleta_id === ctx.bicicletaId, 'deveria escolher a primeira unidade por código');
      assert(u.ponto_id === ctx.pontoId, 'deveria devolver o ponto da unidade');
    }));

  await teste('pula a unidade com reserva ativa sobreposta de OUTRO cliente (a RLS esconde a reserva, a função não)', () =>
    comSavepoint(async () => {
      await criarReserva(client, ctx, { clienteId: ctx.clienteBId, status: 'PENDENTE_PAGAMENTO', inicio: '2026-07-10T09:00:00Z', fim: '2026-07-10T11:00:00Z' });
      const u = await escolher(ctx.clienteAId);
      assert(u && u.bicicleta_id === b2.id, 'deveria escolher a outra unidade');
    }));

  await teste('sem unidade livre devolve nenhuma linha', () =>
    comSavepoint(async () => {
      await criarReserva(client, ctx, { clienteId: ctx.clienteBId, status: 'CONFIRMADA', inicio: INICIO, fim: FIM });
      await criarReserva(client, ctx, { clienteId: ctx.clienteBId, bicicletaId: b2.id, status: 'EM_ANDAMENTO', inicio: '2026-07-10T13:00:00Z', fim: '2026-07-10T18:00:00Z' });
      assert((await escolher(ctx.clienteAId)) === null, 'não deveria haver unidade livre');
    }));

  await teste('reserva que só encosta no período e reserva encerrada não bloqueiam', () =>
    comSavepoint(async () => {
      await criarReserva(client, ctx, { status: 'CONFIRMADA', inicio: '2026-07-10T06:00:00Z', fim: INICIO });
      await criarReserva(client, ctx, { bicicletaId: b2.id, status: 'EXPIRADA', inicio: INICIO, fim: FIM });
      await criarReserva(client, ctx, { bicicletaId: b2.id, status: 'CONCLUIDA', inicio: '2026-07-10T11:00:00Z', fim: '2026-07-10T12:00:00Z' });
      const u = await escolher(ctx.clienteAId);
      assert(u && u.bicicleta_id === ctx.bicicletaId, 'a primeira unidade está livre');
    }));

  await teste('ignora unidade em manutenção, bloqueada ou baixada, e tipo inativo', () =>
    comSavepoint(async () => {
      for (const status of ['MANUTENCAO', 'BLOQUEADA', 'BAIXADA']) {
        await client.query('UPDATE bicicleta SET status = $2 WHERE id = $1', [ctx.bicicletaId, status]);
        const u = await escolher(ctx.clienteAId);
        assert(u && u.bicicleta_id === b2.id, `unidade ${status} não pode ser escolhida`);
      }
      await client.query('UPDATE tipo_bicicleta SET ativo = false WHERE id = $1', [ctx.tipoId]);
      assert((await escolher(ctx.clienteAId)) === null, 'tipo inativo não tem unidade reservável');
    }));

  await teste('ignora unidade de ponto inativo', () =>
    comSavepoint(async () => {
      await client.query('UPDATE ponto SET ativo = false WHERE id = $1', [ctx.pontoId]);
      assert((await escolher(ctx.clienteAId)) === null, 'ponto inativo não oferece unidade');
    }));

  await teste('não escolhe as unidades já tentadas (p_excluir)', () =>
    comSavepoint(async () => {
      const u = await escolher(ctx.clienteAId, [ctx.bicicletaId]);
      assert(u && u.bicicleta_id === b2.id, 'deveria pular a excluída');
      assert((await escolher(ctx.clienteAId, [ctx.bicicletaId, b2.id])) === null, 'excluídas as duas, nenhuma sobra');
    }));

  await teste('período inválido (início depois do fim) é recusado', () =>
    comSavepoint(async () => {
      await executor.esperarErro(
        () => comSavepoint(() => escolher(ctx.clienteAId, [], FIM, INICIO)),
        '22023',
      );
    }));

  await teste('visitante e papel sem sessão não conseguem executar a função', () =>
    comSavepoint(async () => {
      await client.query('SET ROLE app_backend');
      try {
        // visitante: perfil vazio. A função só serve a quem tem sessão de cliente ou da equipe.
        await client.query("SELECT set_config('app.perfil', '', true), set_config('app.usuario_id', '', true)");
        const { rows } = await client.query(
          'SELECT * FROM escolher_unidade_para_reserva($1, $2, $3, $4::uuid[])',
          [ctx.tipoId, INICIO, FIM, []],
        );
        assert(rows.length === 0, 'visitante não deveria receber unidade');
      } finally {
        await client.query('RESET ROLE');
      }
    }));

  await teste('a unidade escolhida fica travada: a transação seguinte (SKIP LOCKED) recebe a outra', async () => {
    // Duas conexões de verdade. A suíte roda em uma transação só (savepoints), então aqui a
    // primeira transação é aberta numa conexão à parte e os dados precisam estar commitados:
    // por isso este teste cria e apaga os próprios dados fora da transação da suíte.
    const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
    const a = new pg.Client({ connectionString: url });
    const b = new pg.Client({ connectionString: url });
    const limpar = new pg.Client({ connectionString: url });
    await Promise.all([a.connect(), b.connect(), limpar.connect()]);
    const sufixo = Math.random().toString(36).slice(2, 8);
    let tipoId = null;
    let pontoId = null;
    try {
      ({ rows: [{ id: pontoId }] } = await limpar.query(
        `INSERT INTO ponto (nome, logradouro, numero, bairro, cep, cidade, uf, ativo)
         VALUES ($1, 'Rua Corrida', '1', 'Centro', '65000000', 'São Luís', 'MA', true) RETURNING id`,
        [`Ponto corrida ${sufixo}`],
      ));
      ({ rows: [{ id: tipoId }] } = await limpar.query(
        `INSERT INTO tipo_bicicleta (nome, atividades, altura_min_cm, altura_max_cm, preco_hora_centavos, preco_dia_centavos)
         VALUES ($1, ARRAY['URBANO']::atividade[], 150, 190, 1000, 5000) RETURNING id`,
        [`Tipo corrida ${sufixo}`],
      ));
      for (const n of [1, 2]) {
        await limpar.query(
          `INSERT INTO bicicleta (tipo_id, ponto_id, codigo) VALUES ($1, $2, $3)`,
          [tipoId, pontoId, `COR-${sufixo}-${n}`],
        );
      }
      // a função só atende quem tem sessão (como o comSessao do app declara)
      const pegar = async (c) => {
        await c.query("SELECT set_config('app.perfil', 'CLIENTE', true), set_config('app.usuario_id', $1, true)", [ctx.clienteAId]);
        return c.query(
          'SELECT bicicleta_id FROM escolher_unidade_para_reserva($1, $2, $3, $4::uuid[])',
          [tipoId, INICIO, FIM, []],
        );
      };
      await a.query('BEGIN');
      await b.query('BEGIN');
      const ra = (await pegar(a)).rows[0];
      const rb = (await pegar(b)).rows[0]; // a unidade de A está travada: B não espera, recebe outra
      assert(ra && rb && ra.bicicleta_id !== rb.bicicleta_id, 'as duas transações deveriam receber unidades diferentes');
      const terceira = new pg.Client({ connectionString: url });
      await terceira.connect();
      try {
        await terceira.query('BEGIN');
        const rc = (await pegar(terceira)).rows[0];
        assert(!rc, 'com as duas unidades travadas, a terceira não recebe nenhuma');
      } finally {
        await terceira.query('ROLLBACK').catch(() => {});
        await terceira.end();
      }
    } finally {
      await a.query('ROLLBACK').catch(() => {});
      await b.query('ROLLBACK').catch(() => {});
      if (tipoId) {
        await limpar.query('DELETE FROM bicicleta WHERE tipo_id = $1', [tipoId]);
        await limpar.query('DELETE FROM tipo_bicicleta WHERE id = $1', [tipoId]);
      }
      if (pontoId) await limpar.query('DELETE FROM ponto WHERE id = $1', [pontoId]);
      await Promise.all([a.end(), b.end(), limpar.end()]);
    }
  });

  // ------------------------------------------------------------------ view reserva_detalhada

  const detalhes = (clienteId, id) =>
    comoCliente(clienteId, async () =>
      (await client.query('SELECT * FROM reserva_detalhada WHERE id = $1', [id])).rows);

  await teste('reserva_detalhada: o cliente vê a própria reserva, com tipo e ponto, e não vê a de outro', () =>
    comSavepoint(async () => {
      const minha = await criarReserva(client, ctx, { clienteId: ctx.clienteAId, status: 'PENDENTE_PAGAMENTO', valorCaucaoCentavos: 15000 });
      const dela = await criarReserva(client, ctx, { clienteId: ctx.clienteBId, bicicletaId: b2.id });
      const [r] = await detalhes(ctx.clienteAId, minha);
      assert(r, 'o cliente deveria ver a própria reserva');
      assert(r.tipo_id === ctx.tipoId && r.tipo_nome === 'Tipo teste-reserva', 'tipo da reserva');
      assert(r.ponto_id === ctx.pontoId && r.ponto_nome === 'Ponto teste-reserva', 'ponto da reserva');
      assert(r.ponto_endereco === 'Rua Teste, 1, Centro', `endereço: ${r.ponto_endereco}`);
      assert(r.valor_caucao_centavos === 15000, 'caução congelada na reserva');
      assert(r.pagamento_status === null && r.pagamento_metodo === null, 'sem pagamento, nulos');
      assert((await detalhes(ctx.clienteAId, dela)).length === 0, 'não pode ver a reserva de outro cliente');
    }));

  await teste('reserva_detalhada: não expõe a bicicleta e traz o pagamento mais recente', () =>
    comSavepoint(async () => {
      const id = await criarReserva(client, ctx, { clienteId: ctx.clienteAId, status: 'PENDENTE_PAGAMENTO' });
      await client.query(
        `INSERT INTO pagamento (reserva_id, metodo, valor_centavos, status, criado_em)
         VALUES ($1, 'PIX', 5000, 'EXPIRADO', now() - interval '1 hour'), ($1, 'PIX', 5000, 'PENDENTE', now())`,
        [id],
      );
      const [r] = await detalhes(ctx.clienteAId, id);
      assert(r.pagamento_status === 'PENDENTE' && r.pagamento_metodo === 'PIX', 'deveria trazer o pagamento mais recente');
      const colunas = Object.keys(r);
      assert(!colunas.includes('bicicleta_id') && !colunas.some((c) => c.includes('bicicleta')), `a view expõe a bicicleta: ${colunas}`);
    }));

  await teste('reserva_detalhada: visitante não vê nada; equipe vê tudo', () =>
    comSavepoint(async () => {
      const id = await criarReserva(client, ctx, { clienteId: ctx.clienteAId });
      await client.query('SET ROLE app_backend');
      try {
        await client.query("SELECT set_config('app.perfil', '', true), set_config('app.usuario_id', '', true)");
        assert((await client.query('SELECT 1 FROM reserva_detalhada WHERE id = $1', [id])).rowCount === 0, 'visitante não deveria ver');
        await client.query("SELECT set_config('app.perfil', 'OPERADOR', true)");
        assert((await client.query('SELECT 1 FROM reserva_detalhada WHERE id = $1', [id])).rowCount === 1, 'equipe deveria ver');
      } finally {
        await client.query('RESET ROLE');
      }
    }));
});
