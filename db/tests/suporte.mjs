// Suporte comum às suítes de teste de banco (unit/, whitebox/, blackbox/): conexão,
// carregamento do .env e um runner mínimo de testes com savepoints.
//
// Cada suíte abre UMA transação, roda os testes com SAVEPOINT por teste e sempre faz
// ROLLBACK no final (passando ou falhando): nenhuma suíte deixa dados no banco.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function carregarEnv(caminho) {
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || linha.trim().startsWith('#')) continue;
    const valor = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = valor;
  }
}

// Conecta com DATABASE_URL_UNPOOLED (ou DATABASE_URL), lida do ambiente ou de .env.local / .env
// na raiz do projeto. Encerra o processo se faltar a variável ou se a conexão usar o pooler.
export async function conectar() {
  carregarEnv(join(raiz, '.env.local'));
  carregarEnv(join(raiz, '.env'));

  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('Defina DATABASE_URL_UNPOOLED no .env.local ou no .env.');
    process.exit(1);
  }
  const destino = new URL(url);
  console.log(`Banco: ${destino.hostname}${destino.pathname}`);
  if (destino.hostname.includes('-pooler')) {
    console.error('Use a conexão direta, sem "-pooler", em DATABASE_URL_UNPOOLED.');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await garantirSetRole(client);
  return client;
}

// No Postgres 16+, quem cria um papel recebe só ADMIN OPTION sobre ele, sem permissão de
// SET ROLE. Os testes de RLS precisam fazer SET ROLE app_backend, então concedemos o SET
// ao usuário de teste (idempotente; o papel é NOLOGIN, então não abre nenhum acesso novo).
async function garantirSetRole(client) {
  const { rows } = await client.query(
    `SELECT current_setting('server_version_num')::int >= 160000 AS pg16,
            EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_backend') AS existe`,
  );
  if (!rows[0].pg16 || !rows[0].existe) return;
  await client.query('GRANT app_backend TO CURRENT_USER WITH SET TRUE');
}

// Runner mínimo: registra o resultado de cada teste() e decide o código de saída no final.
export function criarExecutor(client) {
  const resultados = [];
  let savepointSeq = 0;

  // Roda fn numa savepoint própria e desfaz, com ou sem erro, para um teste não vazar
  // efeito para o próximo.
  async function comSavepoint(fn) {
    const nome = `sp_${savepointSeq++}`;
    await client.query(`SAVEPOINT ${nome}`);
    try {
      return await fn();
    } finally {
      await client.query(`ROLLBACK TO SAVEPOINT ${nome}`);
    }
  }

  async function teste(nome, fn) {
    try {
      await comSavepoint(fn);
      resultados.push({ nome, ok: true });
      console.log(`  OK  ${nome}`);
    } catch (erro) {
      resultados.push({ nome, ok: false, erro });
      console.log(`FALHA ${nome}`);
      console.log(`      ${erro.message}`);
    }
  }

  function assert(condicao, mensagem) {
    if (!condicao) throw new Error(mensagem);
  }

  // Espera que fn rejeite com o SQLSTATE indicado (ex.: '23514' violação de CHECK,
  // '23505' violação de UNIQUE, '23P01' violação de exclusion constraint).
  async function esperarErro(fn, codigoEsperado, nomeConstraintEsperado) {
    try {
      await fn();
    } catch (erro) {
      assert(
        erro.code === codigoEsperado,
        `esperava o erro ${codigoEsperado}, veio ${erro.code ?? '(sem code)'}: ${erro.message}`,
      );
      if (nomeConstraintEsperado) {
        assert(
          erro.constraint === nomeConstraintEsperado,
          `esperava violar "${nomeConstraintEsperado}", veio "${erro.constraint ?? '(desconhecida)'}"`,
        );
      }
      return;
    }
    throw new Error(`esperava o erro ${codigoEsperado}, mas a operação foi aceita`);
  }

  function finalizar(tituloSuite) {
    const falhas = resultados.filter((r) => !r.ok).length;
    console.log(`\n${tituloSuite}: ${resultados.length - falhas}/${resultados.length} testes passaram.`);
    return falhas;
  }

  return { teste, assert, esperarErro, comSavepoint, finalizar };
}

// Função padrão de entrada de uma suíte: abre transação, roda corpo(executor, client),
// sempre faz ROLLBACK e fecha a conexão, e define o exit code a partir das falhas.
export async function rodarSuite(titulo, corpo) {
  const client = await conectar();
  const executor = criarExecutor(client);
  try {
    await client.query('BEGIN');
    await corpo(executor, client);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
  const falhas = executor.finalizar(titulo);
  process.exitCode = falhas > 0 ? 1 : 0;
}
