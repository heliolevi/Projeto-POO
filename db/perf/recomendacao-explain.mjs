// Popula um banco DESCARTÁVEL com 200 bicicletas e 2.000 reservas e roda EXPLAIN ANALYZE na
// consulta de disponibilidade que alimenta a recomendação (unidades livres por tipo no período).
//
//   DATABASE_URL_UNPOOLED=postgresql://postgres:postgres@localhost:5432/bike_perf \
//     node perf/recomendacao-explain.mjs
//
// Só roda em localhost: apaga reservas, pagamentos e bicicletas antes de popular, então nunca
// aponte para o banco real. As migrations precisam estar aplicadas.
//
// Os dados são determinísticos (sem random), então duas execuções geram o mesmo banco.

import pg from 'pg';

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) {
  console.error('Defina DATABASE_URL_UNPOOLED apontando para um banco local descartável.');
  process.exit(1);
}
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
  console.error(`Recusado: "${host}" não é local. Este script apaga dados.`);
  process.exit(1);
}

const N_BICICLETAS = 200;
const N_RESERVAS = 2000;
const N_CLIENTES = 100;

const client = new pg.Client({ connectionString: url });
await client.connect();

async function popular() {
  await client.query('BEGIN');
  await client.query('TRUNCATE pagamento, reserva, bicicleta, tipo_bicicleta, usuario, ponto RESTART IDENTITY CASCADE');

  await client.query(`
    INSERT INTO ponto (nome, logradouro, numero, bairro, cep, cidade, uf, ativo)
    SELECT 'Ponto ' || g, 'Rua ' || g, g::text, 'Centro', '65000000', 'São Luís', 'MA', true
    FROM generate_series(1, 3) g`);

  // 8 tipos com faixas de altura que se sobrepõem, como no catálogo real
  await client.query(`
    INSERT INTO tipo_bicicleta (nome, atividades, altura_min_cm, altura_max_cm, nivel_recomendado,
                                preco_hora_centavos, preco_dia_centavos, valor_caucao_centavos)
    SELECT 'Tipo ' || g,
           (ARRAY['{URBANO}', '{TRILHA}', '{PASSEIO,URBANO}', '{ESPORTE}'])[1 + g % 4]::atividade[],
           140 + g * 5, 165 + g * 5,
           (ARRAY['INICIANTE','INTERMEDIARIO','AVANCADO'])[1 + g % 3]::experiencia,
           800 + g * 100, 4000 + g * 500, 10000
    FROM generate_series(1, 8) g`);

  // 200 bicicletas: distribuídas entre os tipos e pontos; 1 em cada 20 em manutenção
  await client.query(
    `INSERT INTO bicicleta (tipo_id, ponto_id, codigo, status)
     SELECT (SELECT id FROM tipo_bicicleta ORDER BY nome OFFSET (g % 8) LIMIT 1),
            (SELECT id FROM ponto ORDER BY nome OFFSET (g % 3) LIMIT 1),
            'BIC-PERF-' || lpad(g::text, 4, '0'),
            CASE WHEN g % 20 = 0 THEN 'MANUTENCAO'::status_bicicleta ELSE 'DISPONIVEL'::status_bicicleta END
     FROM generate_series(1, $1) g`,
    [N_BICICLETAS],
  );

  await client.query(
    `INSERT INTO usuario (perfil, nome, email, senha_hash, cpf, aceite_termos_em, versao_termos)
     SELECT 'CLIENTE', 'Cliente perf ' || g, 'perf' || g || '@bikeilha.test', 'hash', lpad(g::text, 11, '0'), now(), 'v1'
     FROM generate_series(1, $1) g`,
    [N_CLIENTES],
  );

  // 2.000 reservas = 10 por bicicleta, espaçadas de 2 em 2 dias (sem sobreposição, que a exclusion
  // constraint recusaria), a partir de 60 dias atrás. Mistura de status; só as ativas (pendente,
  // confirmada, em andamento) seguram a bicicleta.
  await client.query(
    `INSERT INTO reserva (codigo, cliente_id, bicicleta_id, ponto_id, periodo, status,
                          valor_aluguel_centavos, valor_caucao_centavos, cancelada_em, criado_em)
     SELECT 'RES-PERF-' || lpad(n::text, 5, '0'),
            (SELECT id FROM usuario ORDER BY email OFFSET (n % $2) LIMIT 1),
            b.id, b.ponto_id,
            tstzrange(base + make_interval(days => k * 2, hours => (b.pos % 6)::int),
                      base + make_interval(days => k * 2, hours => (b.pos % 6)::int + 3 + k % 4), '[)'),
            st,
            5000 + k * 100, 10000,
            CASE WHEN st = 'CANCELADA' THEN base END,
            base - interval '1 day'
     FROM (
       SELECT b.*, row_number() OVER (ORDER BY codigo) AS pos FROM bicicleta b
     ) b
     CROSS JOIN LATERAL (
       SELECT k, (b.pos - 1) * 10 + k + 1 AS n,
              (date_trunc('day', now()) - interval '60 days') AS base,
              (ARRAY['CONCLUIDA','CONCLUIDA','CONFIRMADA','CANCELADA','EXPIRADA','PENDENTE_PAGAMENTO',
                     'CONCLUIDA','EM_ANDAMENTO','NAO_RETIRADA','CONFIRMADA'])[1 + ((k + b.pos) % 10)::int]::status_reserva AS st
       FROM generate_series(0, 9) k
     ) r
     WHERE b.pos <= $1 / 10`,
    [N_RESERVAS, N_CLIENTES],
  );
  await client.query('COMMIT');
}

await popular();
await client.query('ANALYZE');

const { rows: [cont] } = await client.query(`
  SELECT (SELECT count(*) FROM bicicleta) AS bicicletas,
         (SELECT count(*) FROM reserva) AS reservas,
         (SELECT count(*) FROM reserva WHERE status IN ('PENDENTE_PAGAMENTO','CONFIRMADA','EM_ANDAMENTO')) AS ativas`);
console.log('Populado:', cont);

// A consulta da recomendação: por tipo ativo em que o cliente cabe, quantas unidades DISPONIVEL
// não têm reserva ativa sobreposta ao período. Mesma regra de docs/modelo-de-dados.md.
export const CONSULTA = `
  SELECT t.id, t.nome, count(b.id) AS unidades_livres
  FROM tipo_bicicleta t
  JOIN bicicleta b ON b.tipo_id = t.id AND b.status = 'DISPONIVEL'
  WHERE t.ativo
    AND $1::smallint BETWEEN t.altura_min_cm AND t.altura_max_cm
    AND NOT EXISTS (
      SELECT 1 FROM reserva r
      WHERE r.bicicleta_id = b.id
        AND r.status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADA', 'EM_ANDAMENTO')
        AND r.periodo && tstzrange($2::timestamptz, $3::timestamptz, '[)')
    )
  GROUP BY t.id, t.nome
  HAVING count(b.id) > 0
  ORDER BY t.preco_dia_centavos, t.nome`;

// 4 dias depois do início da janela populada (60 dias atrás): dia em que cerca de 40% das bicicletas têm
// reserva ativa (os status giram por bicicleta), entre 0h e 10h, para a consulta cruzar de verdade
const { rows: [janela] } = await client.query(
  `SELECT (date_trunc('day', now()) - interval '56 days' + interval '3 hours') AS ini,
          (date_trunc('day', now()) - interval '56 days' + interval '8 hours') AS fim`,
);
const params = [172, janela.ini, janela.fim];

async function explicar(titulo, preparar = []) {
  console.log(`\n=== ${titulo} ===`);
  await client.query('BEGIN');
  for (const s of preparar) await client.query(s);
  // EXPLAIN não aceita parâmetros $n: valores entram como literais
  const sql = CONSULTA.replace('$1', params[0]).replace('$2', `'${params[1].toISOString()}'`).replace('$3', `'${params[2].toISOString()}'`);
  const { rows } = await client.query(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
  console.log(rows.map((r) => r['QUERY PLAN']).join('\n'));
  await client.query('ROLLBACK');
}

const { rows: resultado } = await client.query(CONSULTA, params);
console.log('\nResultado da consulta (tipo, unidades livres):', resultado.map((r) => `${r.nome}=${r.unidades_livres}`).join(', '));

await explicar('Plano escolhido pelo planejador (padrão)');
await explicar('Forçando índices (enable_seqscan = off) para ver se os índices atendem a consulta', [
  'SET LOCAL enable_seqscan = off',
]);

// A função da migration 0009 (a que a aplicação deve usar, por causa da RLS) tem de dar o mesmo
// total que a consulta direta, sem o filtro de altura.
const t0 = performance.now();
const { rows: [viaFuncao] } = await client.query(
  'SELECT sum(unidades_livres)::int AS total FROM unidades_livres_por_tipo($1, $2, NULL)',
  [params[1], params[2]],
);
const ms = (performance.now() - t0).toFixed(1);
const { rows: [direta] } = await client.query(
  `SELECT count(*)::int AS total FROM bicicleta b JOIN tipo_bicicleta t ON t.id = b.tipo_id
   WHERE b.status = 'DISPONIVEL' AND t.ativo AND NOT EXISTS (
     SELECT 1 FROM reserva r WHERE r.bicicleta_id = b.id
       AND r.status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADA', 'EM_ANDAMENTO')
       AND r.periodo && tstzrange($1::timestamptz, $2::timestamptz, '[)'))`,
  [params[1], params[2]],
);
console.log(`
unidades_livres_por_tipo(): ${viaFuncao.total} livres em ${ms} ms (ida e volta); consulta direta: ${direta.total}`);
if (viaFuncao.total !== direta.total) {
  console.error('DIVERGÊNCIA entre a função e a consulta direta');
  process.exitCode = 1;
}

await client.end();
