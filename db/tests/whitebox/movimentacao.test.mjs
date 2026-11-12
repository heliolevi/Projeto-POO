// Testes de caixa-branca da migration 0010: inspecionam o catálogo do PostgreSQL (RLS, políticas,
// permissões, índices e tipos) em vez de exercitar o comportamento.
//
// node tests/whitebox/movimentacao.test.mjs

import { rodarSuite } from '../suporte.mjs';

await rodarSuite('whitebox/movimentacao', async (executor, client) => {
  const { teste, assert } = executor;

  await teste('tipo_movimentacao tem RETIRADA e DEVOLUCAO', async () => {
    const { rows } = await client.query(
      `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'tipo_movimentacao' ORDER BY enumsortorder`,
    );
    assert(
      JSON.stringify(rows.map((r) => r.enumlabel)) === JSON.stringify(['RETIRADA', 'DEVOLUCAO']),
      `valores inesperados: ${rows.map((r) => r.enumlabel)}`,
    );
  });

  await teste('movimentacao tem a UNIQUE (reserva_id, tipo) e o CHECK do checklist', async () => {
    const { rows } = await client.query(
      `SELECT conname, contype, pg_get_constraintdef(oid) AS def
       FROM pg_constraint WHERE conrelid = 'movimentacao'::regclass`,
    );
    const porNome = Object.fromEntries(rows.map((r) => [r.conname, r]));
    assert(
      porNome.movimentacao_reserva_tipo_unico?.def === 'UNIQUE (reserva_id, tipo)',
      `UNIQUE inesperada: ${porNome.movimentacao_reserva_tipo_unico?.def}`,
    );
    assert(porNome.movimentacao_checklist_lista?.contype === 'c', 'faltou o CHECK do checklist');
  });

  await teste('checklist é jsonb e não aceita nulo', async () => {
    const { rows: [coluna] } = await client.query(
      `SELECT data_type, is_nullable FROM information_schema.columns
       WHERE table_name = 'movimentacao' AND column_name = 'checklist'`,
    );
    assert(coluna.data_type === 'jsonb', `checklist deveria ser jsonb, é ${coluna.data_type}`);
    assert(coluna.is_nullable === 'NO', 'checklist deveria ser NOT NULL');
  });

  await teste('RLS está habilitada em movimentacao', async () => {
    const { rows: [t] } = await client.query(`SELECT relrowsecurity FROM pg_class WHERE relname = 'movimentacao'`);
    assert(t.relrowsecurity === true, 'movimentacao deveria ter ROW LEVEL SECURITY habilitada');
  });

  await teste('as políticas: equipe escreve, cliente só lê pela reserva', async () => {
    const { rows } = await client.query(
      `SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'movimentacao'`,
    );
    const porNome = Object.fromEntries(rows.map((r) => [r.policyname, r]));
    assert(porNome.movimentacao_equipe, 'faltou a política movimentacao_equipe');
    assert(
      porNome.movimentacao_equipe.qual.includes('OPERADOR') && porNome.movimentacao_equipe.qual.includes('ADMIN'),
      `movimentacao_equipe deveria liberar OPERADOR e ADMIN: ${porNome.movimentacao_equipe.qual}`,
    );
    assert(porNome.movimentacao_cliente_le, 'faltou a política movimentacao_cliente_le');
    assert(
      porNome.movimentacao_cliente_le.cmd === 'SELECT',
      `movimentacao_cliente_le deveria ser só de leitura, é ${porNome.movimentacao_cliente_le.cmd}`,
    );
    assert(
      porNome.movimentacao_cliente_le.qual.includes('reserva') &&
        porNome.movimentacao_cliente_le.qual.includes('sessao_usuario_id'),
      `movimentacao_cliente_le deveria olhar a reserva ligada: ${porNome.movimentacao_cliente_le.qual}`,
    );
  });

  await teste('app_backend tem SELECT/INSERT/UPDATE, sem DELETE, em movimentacao', async () => {
    const { rows } = await client.query(
      `SELECT privilege_type FROM information_schema.role_table_grants
       WHERE grantee = 'app_backend' AND table_name = 'movimentacao'`,
    );
    const privilegios = rows.map((r) => r.privilege_type);
    for (const esperado of ['SELECT', 'INSERT', 'UPDATE']) {
      assert(privilegios.includes(esperado), `app_backend deveria ter ${esperado} em movimentacao`);
    }
    assert(!privilegios.includes('DELETE'), 'app_backend não deveria ter DELETE em movimentacao');
  });

  await teste('movimentacao tem o índice de apoio por operador', async () => {
    const { rows } = await client.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'movimentacao'`);
    assert(
      rows.some((r) => r.indexname === 'movimentacao_operador_idx'),
      'faltou o índice movimentacao_operador_idx',
    );
  });
});
