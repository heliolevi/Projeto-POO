// Testes de caixa-branca da migration 0006: inspecionam o catálogo do Postgres (pg_catalog /
// information_schema) para confirmar que os OBJETOS existem como a migration os definiu —
// não exercitam comportamento (isso é papel de blackbox/). Servem para pegar uma migration de
// correção que "funciona" mas mudou um nome, uma expressão de política ou um grant.
//
// node tests/whitebox/schema.test.mjs

import { rodarSuite } from '../suporte.mjs';

await rodarSuite('whitebox/schema', async (executor, client) => {
  const { teste, assert } = executor;

  // -------------------------------------------------------------------------
  // Exclusion constraint
  // -------------------------------------------------------------------------
  await teste('reserva_sem_sobreposicao é EXCLUDE USING gist em (bicicleta_id, periodo)', async () => {
    const { rows } = await client.query(`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conname = 'reserva_sem_sobreposicao' AND conrelid = 'reserva'::regclass
    `);
    assert(rows.length === 1, 'a constraint reserva_sem_sobreposicao deveria existir em reserva');
    const def = rows[0].def;
    assert(/EXCLUDE USING gist/i.test(def), `esperava "EXCLUDE USING gist", veio: ${def}`);
    assert(def.includes('bicicleta_id'), `esperava bicicleta_id na definição: ${def}`);
    assert(def.includes('periodo'), `esperava periodo na definição: ${def}`);
    assert(
      /PENDENTE_PAGAMENTO/.test(def) && /CONFIRMADA/.test(def) && /EM_ANDAMENTO/.test(def),
      `esperava o WHERE com os três status ativos: ${def}`,
    );
    assert(
      !/CANCELADA/.test(def) && !/CONCLUIDA/.test(def),
      `o WHERE não deveria citar status inativos: ${def}`,
    );
  });

  // -------------------------------------------------------------------------
  // CHECK e UNIQUE esperadas
  // -------------------------------------------------------------------------
  await teste('reserva tem as constraints CHECK e UNIQUE esperadas', async () => {
    const { rows } = await client.query(`
      SELECT conname, contype FROM pg_constraint WHERE conrelid = 'reserva'::regclass
    `);
    const porNome = Object.fromEntries(rows.map((r) => [r.conname, r.contype]));
    assert(porNome.reserva_codigo_unico === 'u', 'reserva_codigo_unico deveria ser UNIQUE');
    assert(porNome.reserva_periodo_formato === 'c', 'reserva_periodo_formato deveria ser CHECK');
    assert(porNome.reserva_valores_validos === 'c', 'reserva_valores_validos deveria ser CHECK');
    assert(porNome.reserva_cancelada_em_consistente === 'c', 'reserva_cancelada_em_consistente deveria ser CHECK');
    assert(porNome.reserva_sem_sobreposicao === 'x', 'reserva_sem_sobreposicao deveria ser EXCLUDE');
  });

  await teste('pagamento tem as constraints CHECK e UNIQUE esperadas', async () => {
    const { rows } = await client.query(`
      SELECT conname, contype FROM pg_constraint WHERE conrelid = 'pagamento'::regclass
    `);
    const porNome = Object.fromEntries(rows.map((r) => [r.conname, r.contype]));
    assert(porNome.pagamento_mp_payment_id_unico === 'u', 'pagamento_mp_payment_id_unico deveria ser UNIQUE');
    assert(porNome.pagamento_valor_valido === 'c', 'pagamento_valor_valido deveria ser CHECK');
    assert(porNome.pagamento_pago_em_consistente === 'c', 'pagamento_pago_em_consistente deveria ser CHECK');
  });

  // -------------------------------------------------------------------------
  // Tipos de coluna
  // -------------------------------------------------------------------------
  await teste('reserva.periodo é tstzrange e reserva.cliente_id/bicicleta_id/ponto_id são uuid', async () => {
    const { rows } = await client.query(`
      SELECT column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'reserva'
    `);
    const porNome = Object.fromEntries(rows.map((r) => [r.column_name, r]));
    assert(porNome.periodo.udt_name === 'tstzrange', `periodo deveria ser tstzrange, veio ${porNome.periodo.udt_name}`);
    assert(porNome.cliente_id.udt_name === 'uuid', 'cliente_id deveria ser uuid');
    assert(porNome.bicicleta_id.udt_name === 'uuid', 'bicicleta_id deveria ser uuid');
    assert(porNome.ponto_id.udt_name === 'uuid', 'ponto_id deveria ser uuid');
    assert(porNome.periodo.is_nullable === 'NO', 'periodo deveria ser NOT NULL');
  });

  await teste('pagamento.mp_payment_id é opcional (nullable)', async () => {
    const { rows } = await client.query(`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'pagamento' AND column_name = 'mp_payment_id'
    `);
    assert(rows[0]?.is_nullable === 'YES', 'mp_payment_id deveria aceitar NULL (pagamento ainda sem webhook)');
  });

  // -------------------------------------------------------------------------
  // Enumerações
  // -------------------------------------------------------------------------
  async function valoresDoEnum(nome) {
    const { rows } = await client.query(
      `SELECT enumlabel FROM pg_enum WHERE enumtypid = $1::regtype ORDER BY enumsortorder`,
      [nome],
    );
    return rows.map((r) => r.enumlabel);
  }

  await teste('status_reserva tem os sete valores do modelo de dados', async () => {
    const valores = await valoresDoEnum('status_reserva');
    const esperado = [
      'PENDENTE_PAGAMENTO', 'CONFIRMADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA', 'EXPIRADA', 'NAO_RETIRADA',
    ];
    assert(
      JSON.stringify(valores) === JSON.stringify(esperado),
      `esperava ${JSON.stringify(esperado)}, veio ${JSON.stringify(valores)}`,
    );
  });

  await teste('metodo_pagamento e status_pagamento têm os valores do modelo de dados', async () => {
    const metodos = await valoresDoEnum('metodo_pagamento');
    const status = await valoresDoEnum('status_pagamento');
    assert(
      JSON.stringify(metodos) === JSON.stringify(['PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO']),
      `metodo_pagamento veio ${JSON.stringify(metodos)}`,
    );
    assert(
      JSON.stringify(status) === JSON.stringify(['PENDENTE', 'APROVADO', 'RECUSADO', 'ESTORNADO', 'EXPIRADO']),
      `status_pagamento veio ${JSON.stringify(status)}`,
    );
  });

  // -------------------------------------------------------------------------
  // Row-level security: habilitada e com as políticas esperadas
  // -------------------------------------------------------------------------
  await teste('RLS está habilitada em reserva e pagamento', async () => {
    const { rows } = await client.query(`
      SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('reserva', 'pagamento')
    `);
    const porNome = Object.fromEntries(rows.map((r) => [r.relname, r.relrowsecurity]));
    assert(porNome.reserva === true, 'reserva deveria ter ROW LEVEL SECURITY habilitada');
    assert(porNome.pagamento === true, 'pagamento deveria ter ROW LEVEL SECURITY habilitada');
  });

  await teste('as políticas de reserva restringem por cliente_id e por perfil de equipe', async () => {
    const { rows } = await client.query(`
      SELECT policyname, qual, with_check FROM pg_policies WHERE tablename = 'reserva'
    `);
    const porNome = Object.fromEntries(rows.map((r) => [r.policyname, r]));
    assert(porNome.reserva_cliente, 'faltou a política reserva_cliente');
    assert(porNome.reserva_equipe, 'faltou a política reserva_equipe');
    assert(
      porNome.reserva_cliente.qual.includes('cliente_id') && porNome.reserva_cliente.qual.includes('sessao_usuario_id'),
      `reserva_cliente deveria filtrar por cliente_id = sessao_usuario_id(): ${porNome.reserva_cliente.qual}`,
    );
    assert(
      porNome.reserva_equipe.qual.includes('OPERADOR') && porNome.reserva_equipe.qual.includes('ADMIN'),
      `reserva_equipe deveria liberar OPERADOR e ADMIN: ${porNome.reserva_equipe.qual}`,
    );
  });

  await teste('as políticas de pagamento seguem a reserva (sem cliente_id próprio)', async () => {
    const { rows } = await client.query(`
      SELECT policyname, qual FROM pg_policies WHERE tablename = 'pagamento'
    `);
    const porNome = Object.fromEntries(rows.map((r) => [r.policyname, r]));
    assert(porNome.pagamento_cliente, 'faltou a política pagamento_cliente');
    assert(porNome.pagamento_equipe, 'faltou a política pagamento_equipe');
    assert(
      porNome.pagamento_cliente.qual.includes('reserva_id') && porNome.pagamento_cliente.qual.includes('sessao_usuario_id'),
      `pagamento_cliente deveria olhar a reserva ligada: ${porNome.pagamento_cliente.qual}`,
    );
  });

  // -------------------------------------------------------------------------
  // Permissões do app_backend
  // -------------------------------------------------------------------------
  await teste('app_backend tem SELECT/INSERT/UPDATE, sem DELETE, em reserva e pagamento', async () => {
    const { rows } = await client.query(`
      SELECT table_name, privilege_type
      FROM information_schema.role_table_grants
      WHERE grantee = 'app_backend' AND table_name IN ('reserva', 'pagamento')
    `);
    for (const tabela of ['reserva', 'pagamento']) {
      const privilegios = rows.filter((r) => r.table_name === tabela).map((r) => r.privilege_type);
      for (const esperado of ['SELECT', 'INSERT', 'UPDATE']) {
        assert(privilegios.includes(esperado), `app_backend deveria ter ${esperado} em ${tabela}`);
      }
      assert(!privilegios.includes('DELETE'), `app_backend não deveria ter DELETE em ${tabela}`);
    }
  });

  // -------------------------------------------------------------------------
  // Índices de apoio (fora da exclusion constraint)
  // -------------------------------------------------------------------------
  await teste('reserva e pagamento têm os índices de apoio às consultas por FK', async () => {
    const { rows } = await client.query(`
      SELECT indexname FROM pg_indexes WHERE tablename IN ('reserva', 'pagamento')
    `);
    const nomes = rows.map((r) => r.indexname);
    for (const esperado of ['reserva_cliente_idx', 'reserva_ponto_idx', 'pagamento_reserva_idx']) {
      assert(nomes.includes(esperado), `faltou o índice ${esperado}`);
    }
  });
});
