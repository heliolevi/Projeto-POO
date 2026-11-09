// Aplica db/seeds/dev.sql no banco de DESENVOLVIMENTO.
//
//   node seeds/aplicar-seed.mjs --ok-dev
//
// Lê do ambiente, do .env.local ou do .env na raiz do projeto:
//   DATABASE_URL_UNPOOLED   conexão direta com o banco (a mesma das migrations)
//   SEED_ADMIN_SENHA        senha do admin@bikeilha.test (8 caracteres ou mais, com letra e número)
//   SEED_OPERADOR_SENHA     senha do operador@bikeilha.test (idem)
//
// As senhas só existem no ambiente local: este script gera o hash (o mesmo scrypt do app) e o
// entrega ao banco numa configuração da sessão, sem gravar a senha em lugar nenhum.
// A flag --ok-dev existe para você conferir o host impresso e confirmar que NÃO é o production.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..', '..');

function carregarEnv(caminho) {
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || linha.trim().startsWith('#')) continue;
    const valor = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = valor;
  }
}

function senhaDoAmbiente(nome) {
  const senha = process.env[nome];
  if (!senha) {
    console.error(`Defina ${nome} no .env.local (a senha de teste, só para o seu ambiente).`);
    process.exit(1);
  }
  if (senha.length < 8 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha)) {
    console.error(`${nome} precisa ter 8 caracteres ou mais, com ao menos uma letra e um número.`);
    process.exit(1);
  }
  return senha;
}

async function main() {
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
  if (!process.argv.includes('--ok-dev')) {
    console.error('Este seed é só para o ambiente de DESENVOLVIMENTO.');
    console.error('Confira o host acima. Se for o branch dev do Neon, rode de novo com --ok-dev.');
    process.exit(1);
  }

  const senhaAdmin = senhaDoAmbiente('SEED_ADMIN_SENHA');
  const senhaOperador = senhaDoAmbiente('SEED_OPERADOR_SENHA');

  // reaproveita a função de hash do app, para o login aceitar a senha
  const { gerarHashSenha } = await import(
    pathToFileURL(join(raiz, 'src', 'modules', 'contas', 'infrastructure', 'senha.ts')).href
  );
  const hashAdmin = await gerarHashSenha(senhaAdmin);
  const hashOperador = await gerarHashSenha(senhaOperador);

  const sql = readFileSync(join(aqui, 'dev.sql'), 'utf8');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('seed.hash_admin', $1, true), set_config('seed.hash_operador', $2, true)",
      [hashAdmin, hashOperador],
    );
    await client.query(sql);
    await client.query('COMMIT');
    const { rows } = await client.query(
      `SELECT (SELECT count(*) FROM empresa) AS empresas,
              (SELECT count(*) FROM ponto) AS pontos,
              (SELECT count(*) FROM tipo_bicicleta) AS tipos,
              (SELECT count(*) FROM bicicleta) AS bicicletas,
              (SELECT count(*) FROM usuario WHERE perfil IN ('ADMIN', 'OPERADOR')) AS equipe`,
    );
    console.log('Seed aplicado:', rows[0]);
  } catch (erro) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Falhou, nada foi gravado:', erro.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
