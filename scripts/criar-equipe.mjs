// Cria uma conta de ADMIN ou OPERADOR no banco. Não há tela para criar a equipe da locadora.
//
//   npm run criar-equipe
//
// Pergunta o perfil, o nome, o e-mail e a senha. A senha é digitada em um prompt oculto (nunca por
// argumento, para não ficar no histórico do terminal), e o script gera o hash com a mesma função
// do app (scrypt), então o login aceita a senha. Nada disso é impresso nem gravado em arquivo.
//
// Lê do ambiente, do .env.local ou do .env na raiz do projeto:
//   DATABASE_URL_UNPOOLED   conexão direta com o banco (a mesma das migrations)
//
// O script mostra o host do banco e pede uma confirmação antes de gravar: confira se é o banco certo.
// Em production, só rode com a autorização do tech lead.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');

const PERFIS = ['ADMIN', 'OPERADOR'];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const SENHA_MIN = 8;
const SENHA_MAX = 128;

// As regras abaixo são as mesmas do cadastro (src/modules/contas/domain/validacao.ts).

export function validarPerfil(entrada) {
  const perfil = entrada.trim().toUpperCase();
  if (perfil === 'CLIENTE') {
    return { erro: 'Clientes se cadastram pelo app. Aqui só ADMIN ou OPERADOR.' };
  }
  if (!PERFIS.includes(perfil)) return { erro: 'Perfil inválido. Digite ADMIN ou OPERADOR.' };
  return { valor: perfil };
}

export function validarNome(entrada) {
  const nome = entrada.trim().replace(/\s+/g, ' ');
  if (nome.length < 3 || nome.length > 120) {
    return { erro: 'Informe o nome completo (3 a 120 caracteres).' };
  }
  return { valor: nome };
}

export function validarEmail(entrada) {
  // minúsculas: o login procura o e-mail já em minúsculas, então a conta precisa ser gravada assim
  const email = entrada.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return { erro: 'E-mail inválido.' };
  return { valor: email };
}

export function validarSenha(senha) {
  if (senha.length < SENHA_MIN || senha.length > SENHA_MAX) {
    return { erro: `A senha deve ter de ${SENHA_MIN} a ${SENHA_MAX} caracteres.` };
  }
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) {
    return { erro: 'A senha deve ter ao menos uma letra e um número.' };
  }
  return { valor: senha };
}

function carregarEnv(caminho) {
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || linha.trim().startsWith('#')) continue;
    const valor = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = valor;
  }
}

// Pergunta no terminal. No modo oculto, o que é digitado não aparece na tela.
function criarPerguntador() {
  let oculto = false;
  const saida = new Writable({
    write(trecho, codificacao, pronto) {
      if (!oculto) process.stdout.write(trecho, codificacao);
      pronto();
    },
  });
  const leitor = createInterface({ input: process.stdin, output: saida, terminal: true });
  return {
    async perguntar(texto) {
      oculto = false;
      return leitor.question(texto);
    },
    async perguntarOculto(texto) {
      process.stdout.write(texto);
      oculto = true;
      const resposta = await leitor.question('');
      oculto = false;
      process.stdout.write('\n');
      return resposta;
    },
    fechar() {
      leitor.close();
    },
  };
}

// Repete a pergunta até a resposta passar na validação.
async function perguntarValidando(perguntador, texto, validar) {
  for (;;) {
    const resposta = await perguntador.perguntar(texto);
    const resultado = validar(resposta);
    if ('valor' in resultado) return resultado.valor;
    console.log(resultado.erro);
  }
}

async function perguntarSenha(perguntador) {
  for (;;) {
    const senha = await perguntador.perguntarOculto('Senha (não aparece na tela): ');
    const resultado = validarSenha(senha);
    if ('erro' in resultado) {
      console.log(resultado.erro);
      continue;
    }
    const confirmacao = await perguntador.perguntarOculto('Repita a senha: ');
    if (confirmacao === senha) return senha;
    console.log('As senhas não são iguais. Tente de novo.');
  }
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
  if (!process.stdin.isTTY) {
    console.error('Rode em um terminal interativo, para digitar a senha sem que ela apareça.');
    process.exit(1);
  }

  const perguntador = criarPerguntador();
  let perfil;
  let nome;
  let email;
  let senha;
  try {
    perfil = await perguntarValidando(perguntador, 'Perfil (ADMIN ou OPERADOR): ', validarPerfil);
    nome = await perguntarValidando(perguntador, 'Nome completo: ', validarNome);
    email = await perguntarValidando(perguntador, 'E-mail: ', validarEmail);
    senha = await perguntarSenha(perguntador);

    console.log(`\nVai criar ${perfil} "${nome}" (${email}) no banco ${destino.hostname}.`);
    const resposta = await perguntador.perguntar('Digite "sim" para confirmar: ');
    if (resposta.trim().toLowerCase() !== 'sim') {
      console.log('Cancelado. Nada foi gravado.');
      return;
    }
  } finally {
    perguntador.fechar();
  }

  // reaproveita a função de hash do app, para o login aceitar a senha
  const { gerarHashSenha } = await import(
    pathToFileURL(join(raiz, 'src', 'modules', 'contas', 'infrastructure', 'senha.ts')).href
  );
  const hash = await gerarHashSenha(senha);

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const existente = await client.query('SELECT 1 FROM usuario WHERE email = $1', [email]);
    if (existente.rowCount > 0) {
      console.error('Já existe uma conta com este e-mail. Nada foi gravado.');
      process.exitCode = 1;
      return;
    }
    // com um único ponto de retirada ativo, o operador já fica ligado a ele
    let pontoId = null;
    if (perfil === 'OPERADOR') {
      const { rows } = await client.query('SELECT id FROM ponto WHERE ativo');
      if (rows.length === 1) pontoId = rows[0].id;
    }
    const { rows } = await client.query(
      `INSERT INTO usuario (perfil, nome, email, senha_hash, ativo, ponto_id)
       VALUES ($1::perfil_usuario, $2, $3, $4, true, $5)
       RETURNING id`,
      [perfil, nome, email, hash, pontoId],
    );
    console.log(`Conta criada: ${perfil} ${email} (id ${rows[0].id}).`);
  } catch (erro) {
    if (erro.code === '23505') {
      console.error('Já existe uma conta com este e-mail. Nada foi gravado.');
    } else {
      console.error('Falhou, nada foi gravado:', erro.message);
    }
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

// Só roda quando chamado direto (npm run criar-equipe), para os validadores poderem ser importados.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro) => {
    // só a mensagem: nada de pilha de chamadas com valores digitados
    console.error('Falhou, nada foi gravado:', erro.message);
    process.exit(1);
  });
}
