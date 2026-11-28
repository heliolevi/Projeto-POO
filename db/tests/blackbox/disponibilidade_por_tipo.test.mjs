// Testes de caixa-preta de unidades_livres_por_tipo() (migration 0009): chamam a função como o
// backend faz, inclusive com o papel app_backend e perfil CLIENTE (onde a RLS esconde as
// reservas dos outros), e só olham as contagens devolvidas.
//
// node tests/blackbox/disponibilidade_por_tipo.test.mjs

import { rodarSuite } from '../suporte.mjs';
import { criarFixtures, criarReserva } from '../fixtures.mjs';

await rodarSuite('blackbox/disponibilidade_por_tipo', async (executor, client) => {
  const { teste, assert, esperarErro, comSavepoint } = executor;
  const ctx = await criarFixtures(client);

  // período de busca usado na maioria dos testes
  const INI = '2026-08-01T10:00:00Z';
  const FIM = '2026-08-01T14:00:00Z';

  // Tipo e bicicletas próprios, para as contagens não dependerem de dados que já existam no banco.
  async function novoTipo(sufixo, { ativo = true } = {}) {
    const { rows: [t] } = await client.query(
      `INSERT INTO tipo_bicicleta (nome, atividades, altura_min_cm, altura_max_cm, preco_hora_centavos, preco_dia_centavos, ativo)
       VALUES ($1, ARRAY['URBANO']::atividade[], 150, 190, 1000, 5000, $2) RETURNING id`,
      [`Tipo disp ${sufixo}`, ativo],
    );
    return t.id;
  }
  async function novaBicicleta(tipoId, codigo, { status = 'DISPONIVEL', pontoId = ctx.pontoId } = {}) {
    const { rows: [b] } = await client.query(
      `INSERT INTO bicicleta (tipo_id, ponto_id, codigo, status) VALUES ($1, $2, $3, $4) RETURNING id`,
      [tipoId, pontoId, codigo, status],
    );
    return b.id;
  }
  async function livres(tipoId, { inicio = INI, fim = FIM, pontoId = null } = {}) {
    const { rows } = await client.query(
      'SELECT unidades_livres FROM unidades_livres_por_tipo($1, $2, $3) WHERE tipo_id = $4',
      [inicio, fim, pontoId, tipoId],
    );
    return rows.length === 0 ? 0 : rows[0].unidades_livres;
  }
  const reservar = (bicicletaId, overrides = {}) =>
    criarReserva(client, ctx, { bicicletaId, inicio: INI, fim: FIM, ...overrides });

  await teste('conta as unidades DISPONIVEL sem nenhuma reserva', () =>
    comSavepoint(async () => {
      const tipo = await novoTipo('a');
      await novaBicicleta(tipo, 'DISP-A1');
      await novaBicicleta(tipo, 'DISP-A2');
      assert((await livres(tipo)) === 2, 'deveria contar 2');
    }));

  await teste('desconta a unidade com reserva ativa que se sobrepõe ao período', () =>
    comSavepoint(async () => {
      const tipo = await novoTipo('b');
      const b1 = await novaBicicleta(tipo, 'DISP-B1');
      await novaBicicleta(tipo, 'DISP-B2');
      for (const [i, status] of ['PENDENTE_PAGAMENTO', 'CONFIRMADA', 'EM_ANDAMENTO'].entries()) {
        await comSavepoint(async () => {
          await reservar(b1, { status, inicio: '2026-08-01T12:00:00Z', fim: '2026-08-01T18:00:00Z' });
          assert((await livres(tipo)) === 1, `${status} deveria descontar a unidade (caso ${i})`);
        });
      }
    }));

  await teste('reserva CANCELADA, EXPIRADA, CONCLUIDA ou NAO_RETIRADA não desconta', () =>
    comSavepoint(async () => {
      const tipo = await novoTipo('c');
      const b1 = await novaBicicleta(tipo, 'DISP-C1');
      await reservar(b1, { status: 'CANCELADA', canceladaEm: '2026-07-01T00:00:00Z' });
      await reservar(b1, { status: 'EXPIRADA' });
      await reservar(b1, { status: 'CONCLUIDA' });
      await reservar(b1, { status: 'NAO_RETIRADA' });
      assert((await livres(tipo)) === 1, 'a unidade deveria seguir livre');
    }));

  await teste('períodos encostados não contam como sobreposição (fim exclusivo)', () =>
    comSavepoint(async () => {
      const tipo = await novoTipo('d');
      const b1 = await novaBicicleta(tipo, 'DISP-D1');
      await reservar(b1, { inicio: '2026-08-01T06:00:00Z', fim: INI });
      await reservar(b1, { inicio: FIM, fim: '2026-08-01T18:00:00Z' });
      assert((await livres(tipo)) === 1, 'reservas que só encostam no período não devem descontar');
    }));

  await teste('ignora unidades fora de DISPONIVEL e tipos inativos', () =>
    comSavepoint(async () => {
      const ativo = await novoTipo('e1');
      await novaBicicleta(ativo, 'DISP-E1', { status: 'MANUTENCAO' });
      await novaBicicleta(ativo, 'DISP-E2', { status: 'BLOQUEADA' });
      await novaBicicleta(ativo, 'DISP-E3', { status: 'BAIXADA' });
      await novaBicicleta(ativo, 'DISP-E4');
      const inativo = await novoTipo('e2', { ativo: false });
      await novaBicicleta(inativo, 'DISP-E5');
      assert((await livres(ativo)) === 1, 'só a DISPONIVEL conta');
      assert((await livres(inativo)) === 0, 'tipo inativo não aparece');
    }));

  await teste('tipo sem unidade livre não aparece no resultado', () =>
    comSavepoint(async () => {
      const tipo = await novoTipo('f');
      await reservar(await novaBicicleta(tipo, 'DISP-F1'));
      const { rows } = await client.query(
        'SELECT 1 FROM unidades_livres_por_tipo($1, $2, NULL) WHERE tipo_id = $3', [INI, FIM, tipo],
      );
      assert(rows.length === 0, 'o tipo não deveria constar');
    }));

  await teste('filtra por ponto quando informado', () =>
    comSavepoint(async () => {
      const { rows: [outro] } = await client.query(`
        INSERT INTO ponto (nome, logradouro, numero, bairro, cep, cidade, uf, ativo)
        VALUES ('Ponto disp outro', 'Rua B', '2', 'Centro', '65000000', 'São Luís', 'MA', true) RETURNING id`);
      const tipo = await novoTipo('g');
      await novaBicicleta(tipo, 'DISP-G1');
      await novaBicicleta(tipo, 'DISP-G2', { pontoId: outro.id });
      await novaBicicleta(tipo, 'DISP-G3', { pontoId: outro.id });
      assert((await livres(tipo, { pontoId: ctx.pontoId })) === 1, 'o ponto de teste tem 1');
      assert((await livres(tipo, { pontoId: outro.id })) === 2, 'o outro ponto tem 2');
      assert((await livres(tipo)) === 3, 'sem ponto, conta a frota toda');
    }));

  await teste('rejeita período inválido (início >= fim ou nulo)', () =>
    comSavepoint(async () => {
      for (const [ini, fim] of [[FIM, INI], [INI, INI], [null, FIM], [INI, null]]) {
        await comSavepoint(() =>
          esperarErro(() => client.query('SELECT * FROM unidades_livres_por_tipo($1, $2, NULL)', [ini, fim]), '22023'));
      }
    }));

  await teste('um CLIENTE enxerga as reservas de outros clientes na disponibilidade (RLS não distorce)', () =>
    comSavepoint(async () => {
      const tipo = await novoTipo('h');
      await novaBicicleta(tipo, 'DISP-H1');
      const b2 = await novaBicicleta(tipo, 'DISP-H2');
      // a bicicleta H2 está reservada pelo cliente B; quem busca é o cliente A
      await reservar(b2, { clienteId: ctx.clienteBId });

      await client.query('SET ROLE app_backend');
      let contagem;
      try {
        await client.query(
          "SELECT set_config('app.perfil', 'CLIENTE', true), set_config('app.usuario_id', $1, true)",
          [ctx.clienteAId],
        );
        const { rows } = await client.query(
          'SELECT unidades_livres FROM unidades_livres_por_tipo($1, $2, NULL) WHERE tipo_id = $3', [INI, FIM, tipo],
        );
        contagem = rows[0]?.unidades_livres;
      } finally {
        await client.query('RESET ROLE');
      }
      assert(contagem === 1, `esperava 1 livre, veio ${contagem}`);
    }));

  await teste('só app_backend pode executar a função (PUBLIC não), que é SECURITY DEFINER com search_path fixo', async () => {
    const { rows: [r] } = await client.query(`
      SELECT has_function_privilege('app_backend', 'unidades_livres_por_tipo(timestamptz, timestamptz, uuid)', 'EXECUTE') AS app,
             has_function_privilege('public',      'unidades_livres_por_tipo(timestamptz, timestamptz, uuid)', 'EXECUTE') AS publico,
             p.prosecdef, p.proconfig
      FROM pg_proc p WHERE p.proname = 'unidades_livres_por_tipo'`);
    assert(r.app && !r.publico, 'permissões erradas');
    assert(r.prosecdef, 'deveria ser SECURITY DEFINER');
    assert(r.proconfig?.some((c) => c.startsWith('search_path=')), 'deveria fixar o search_path');
  });
});
