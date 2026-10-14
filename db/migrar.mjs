// Aplica as migrations de db/migrations no banco.
//
//   node migrar.mjs up [--simular]   aplica as pendentes (--simular desfaz tudo no final)
//   node migrar.mjs down             desfaz a última aplicada
//   node migrar.mjs status           lista aplicadas e pendentes
//
// A conexão vem de DATABASE_URL_UNPOOLED (ou DATABASE_URL), lidas do ambiente
// ou do arquivo .env.local na raiz do projeto. Precisa ser a conexão direta, sem pool:
// o lock que impede duas execuções ao mesmo tempo não funciona atrás do pooler.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const aqui = dirname(fileURLToPath(import.meta.url));
const pastaMigrations = join(aqui, 'migrations');
const LOCK_ID = 727274;

function carregarEnv(caminho) {
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || linha.trim().startsWith('#')) continue;
    const valor = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = valor;
  }
}

function lerMigrations() {
  return readdirSync(pastaMigrations)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort()
    .map((arquivo) => {
      const texto = readFileSync(join(pastaMigrations, arquivo), 'utf8');
      const iUp = texto.indexOf('-- migrate:up');
      const iDown = texto.indexOf('-- migrate:down');
      if (iUp === -1 || iDown === -1 || iDown < iUp) {
        throw new Error(`${arquivo}: faltam os marcadores "-- migrate:up" e "-- migrate:down"`);
      }
      return {
        versao: arquivo.split('_')[0],
        nome: arquivo.replace(/^\d+_/, '').replace(/\.sql$/, ''),
        arquivo,
        up: texto.slice(iUp + '-- migrate:up'.length, iDown),
        down: texto.slice(iDown + '-- migrate:down'.length),
        // o Git no Windows pode converter as quebras de linha; sem normalizar, o mesmo
        // arquivo teria checksums diferentes de uma máquina para outra
        checksum: createHash('sha256').update(texto.replace(/\r\n/g, '\n')).digest('hex'),
      };
    });
}

async function main() {
  const [comando = 'status', ...flags] = process.argv.slice(2);
  const simular = flags.includes('--simular');
  if (simular && comando !== 'up') {
    console.error('--simular só vale para o comando "up".');
    process.exit(1);
  }

  carregarEnv(join(aqui, '..', '.env.local'));
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('Defina DATABASE_URL_UNPOOLED no .env.local.');
    process.exit(1);
  }

  const destino = new URL(url);
  console.log(`Banco: ${destino.hostname}${destino.pathname}`);
  if (destino.hostname.includes('-pooler')) {
    console.error('A conexão usa o pooler (host com "-pooler"). Para as migrations use a conexão direta, sem "-pooler", em DATABASE_URL_UNPOOLED.');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    // na simulação tudo acontece numa transação só, que é desfeita no final
    if (simular) await client.query('BEGIN');
    // status só lê: não cria a tabela de controle se ela ainda não existe
    if (comando !== 'status') {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          versao      text PRIMARY KEY,
          nome        text NOT NULL,
          checksum    text NOT NULL,
          aplicada_em timestamptz NOT NULL DEFAULT now()
        )`);
    }

    const migrations = lerMigrations();
    const { rows: existe } = await client.query(`SELECT to_regclass('schema_migrations') AS tabela`);
    const rows = existe[0].tabela
      ? (await client.query('SELECT versao, checksum FROM schema_migrations ORDER BY versao')).rows
      : [];
    const aplicadas = new Map(rows.map((r) => [r.versao, r.checksum]));

    for (const m of migrations) {
      if (aplicadas.has(m.versao) && aplicadas.get(m.versao) !== m.checksum) {
        console.warn(`Aviso: ${m.arquivo} foi alterada depois de aplicada. Crie uma nova migration em vez de editar.`);
      }
    }

    if (comando === 'status') {
      for (const m of migrations) {
        console.log(`${aplicadas.has(m.versao) ? 'aplicada ' : 'pendente '} ${m.arquivo}`);
      }
    } else if (comando === 'up') {
      const pendentes = migrations.filter((m) => !aplicadas.has(m.versao));
      if (pendentes.length === 0) console.log('Nada a aplicar.');
      for (const m of pendentes) {
        if (!simular) await client.query('BEGIN');
        try {
          await client.query(m.up);
          await client.query('INSERT INTO schema_migrations (versao, nome, checksum) VALUES ($1, $2, $3)', [
            m.versao,
            m.nome,
            m.checksum,
          ]);
          if (!simular) await client.query('COMMIT');
          console.log(`${simular ? 'simulada ' : 'aplicada '} ${m.arquivo}`);
        } catch (erro) {
          if (!simular) await client.query('ROLLBACK');
          throw new Error(`${m.arquivo}: ${erro.message}`);
        }
      }
    } else if (comando === 'down') {
      const ultima = [...migrations].reverse().find((m) => aplicadas.has(m.versao));
      if (!ultima) {
        console.log('Nenhuma migration aplicada.');
      } else {
        await client.query('BEGIN');
        try {
          await client.query(ultima.down);
          await client.query('DELETE FROM schema_migrations WHERE versao = $1', [ultima.versao]);
          await client.query('COMMIT');
          console.log(`revertida ${ultima.arquivo}`);
        } catch (erro) {
          await client.query('ROLLBACK');
          throw new Error(`${ultima.arquivo}: ${erro.message}`);
        }
      }
    } else {
      console.error(`Comando desconhecido: ${comando}`);
      process.exitCode = 1;
    }
  } finally {
    if (simular) {
      await client.query('ROLLBACK').catch(() => {});
      console.log('Simulação: nada foi gravado no banco.');
    }
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    await client.end();
  }
}

main().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
