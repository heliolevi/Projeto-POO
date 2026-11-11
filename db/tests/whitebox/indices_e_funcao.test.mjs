// Testes de caixa-branca da migration 0008: inspeciona o catálogo do PostgreSQL (índices,
// colunas, triggers e propriedades da função expirar_reservas_vencidas).
//
// node tests/whitebox/indices_e_funcao.test.mjs

import { rodarSuite } from '../suporte.mjs';

await rodarSuite('whitebox/indices_e_funcao', async (executor, client) => {
  const { teste, assert } = executor;

  async function definicaoDoIndice(nome) {
    const { rows } = await client.query('SELECT indexdef FROM pg_indexes WHERE indexname = $1', [nome]);
    return rows[0]?.indexdef;
  }

  // Índices que a revisão exigiu (cada um com a ordem das colunas, que importa)
  await teste('existe o índice reserva(cliente_id, status)', async () => {
    const def = await definicaoDoIndice('reserva_cliente_status_idx');
    assert(def?.includes('(cliente_id, status)'), `definição inesperada: ${def}`);
  });

  await teste('existe o índice bicicleta(tipo_id, status)', async () => {
    const def = await definicaoDoIndice('bicicleta_tipo_status_idx');
    assert(def?.includes('(tipo_id, status)'), `definição inesperada: ${def}`);
  });

  await teste('existe o índice pagamento(reserva_id)', async () => {
    const def = await definicaoDoIndice('pagamento_reserva_idx');
    assert(def?.includes('(reserva_id)'), `definição inesperada: ${def}`);
  });

  await teste('o índice redundante reserva_cliente_idx foi removido', async () => {
    assert((await definicaoDoIndice('reserva_cliente_idx')) === undefined, 'reserva_cliente_idx ainda existe');
  });

  await teste('o índice parcial das pendentes cobre só PENDENTE_PAGAMENTO', async () => {
    const def = await definicaoDoIndice('reserva_pendente_criado_idx');
    assert(def?.includes('(criado_em)') && def.includes('PENDENTE_PAGAMENTO'), `definição inesperada: ${def}`);
  });

  // atualizado_em
  await teste('reserva e pagamento têm atualizado_em NOT NULL com default now()', async () => {
    const { rows } = await client.query(`
      SELECT table_name, is_nullable, column_default FROM information_schema.columns
      WHERE table_name IN ('reserva', 'pagamento') AND column_name = 'atualizado_em'
      ORDER BY table_name
    `);
    assert(rows.length === 2, `esperava 2 colunas, vieram ${rows.length}`);
    for (const r of rows) {
      assert(r.is_nullable === 'NO', `${r.table_name}.atualizado_em deveria ser NOT NULL`);
      assert(r.column_default?.includes('now()'), `${r.table_name}.atualizado_em sem default now()`);
    }
  });

  await teste('os triggers de atualizado_em são BEFORE UPDATE FOR EACH ROW', async () => {
    const { rows } = await client.query(`
      SELECT c.relname, t.tgname, (t.tgtype & 2) <> 0 AS before, (t.tgtype & 16) <> 0 AS update, (t.tgtype & 1) <> 0 AS por_linha
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE t.tgname IN ('reserva_atualizado_em', 'pagamento_atualizado_em') AND NOT t.tgisinternal
    `);
    assert(rows.length === 2, `esperava 2 triggers, vieram ${rows.length}`);
    for (const r of rows) assert(r.before && r.update && r.por_linha, `${r.tgname} não é BEFORE UPDATE FOR EACH ROW`);
  });

  // função
  await teste('expirar_reservas_vencidas() é SECURITY DEFINER, sem parâmetros, com search_path fixo', async () => {
    const { rows } = await client.query(`
      SELECT prosecdef, pronargs, proconfig, prorettype::regtype::text AS retorno
      FROM pg_proc WHERE proname = 'expirar_reservas_vencidas'
    `);
    assert(rows.length === 1, 'a função deveria existir uma única vez');
    assert(rows[0].prosecdef, 'deveria ser SECURITY DEFINER');
    assert(rows[0].pronargs === 0, 'não pode receber parâmetros (o prazo é regra do sistema)');
    assert(rows[0].retorno === 'integer', `deveria devolver integer, devolve ${rows[0].retorno}`);
    assert(
      rows[0].proconfig?.some((c) => c.startsWith('search_path=')),
      'deveria fixar o search_path',
    );
  });

  await teste('só app_backend pode executar expirar_reservas_vencidas (PUBLIC não)', async () => {
    const { rows: [r] } = await client.query(`
      SELECT has_function_privilege('app_backend', 'expirar_reservas_vencidas()', 'EXECUTE') AS app,
             has_function_privilege('public',      'expirar_reservas_vencidas()', 'EXECUTE') AS publico
    `);
    assert(r.app, 'app_backend deveria poder executar');
    assert(!r.publico, 'PUBLIC não deveria poder executar');
  });
});
