// Teste ponta a ponta: buscar, reservar, pagar, retirar e devolver, pelas rotas reais da API.
//
// Uso (da raiz do projeto, com o servidor no ar e o .env.local apontando para o Neon dev):
//   node scripts/teste-fluxo-completo.mjs                                  (usa http://localhost:3000)
//   BASE_URL=http://localhost:3100 node scripts/teste-fluxo-completo.mjs
//
// Contra um deploy (Preview da Vercel): precisa do mesmo banco do deploy no DATABASE_URL_UNPOOLED, do
// STRIPE_WEBHOOK_SECRET do deploy (para assinar o aviso da Stripe) e de ESTRESSE_PERMITIR_REMOTO=sim.
// Se a Preview tiver proteção da Vercel, passe o token em BYPASS (ele vai no cabeçalho, nunca na URL):
//   BASE_URL=https://<preview>.vercel.app BYPASS=<token> ESTRESSE_PERMITIR_REMOTO=sim \
//     node scripts/teste-fluxo-completo.mjs
//
// O que ele cria no banco: uma conta de cliente e uma de operador (e-mails @bikeilha.test), uma reserva
// e um Pix de teste na Stripe. No fim desativa as duas contas. A reserva termina CONCLUIDA.
// Só rode contra banco de DESENVOLVIMENTO ou de demonstração e com a chave de TESTE da Stripe (sk_test_):
// o script recusa a chave sk_live_. Nunca imprime senhas, tokens nem segredos.
//
// Saída: uma linha por verificação (OK ou FALHA). Código de saída: 0 sem falhas, 1 com falhas.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(raiz, 'package.json'));
const Stripe = require('stripe');
const pg = require('pg');

const env = { ...process.env };
for (const nome of ['.env.local', '.env']) {
  const arquivo = join(raiz, nome);
  if (!existsSync(arquivo)) continue;
  for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

const BASE = (env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const LOCAL = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(BASE).hostname);
if (!LOCAL && env.ESTRESSE_PERMITIR_REMOTO !== 'sim') {
  console.error(`Recusado: ${BASE} não é um servidor local. Com ESTRESSE_PERMITIR_REMOTO=sim, só em ambiente de teste.`);
  process.exit(2);
}
if (!env.DATABASE_URL_UNPOOLED) {
  console.error('Defina DATABASE_URL_UNPOOLED (conexão direta do mesmo banco do servidor).');
  process.exit(2);
}
if ((env.STRIPE_SECRET_KEY ?? '').startsWith('sk_live_')) {
  console.error('Recusado: STRIPE_SECRET_KEY é de produção (sk_live_). Use a chave de teste.');
  process.exit(2);
}
const SEGREDO_WEBHOOK = env.STRIPE_WEBHOOK_SECRET;
if (!SEGREDO_WEBHOOK) {
  console.error('Defina STRIPE_WEBHOOK_SECRET (o mesmo do servidor), para assinar o aviso da Stripe.');
  process.exit(2);
}

const rodada = Date.now().toString(36);
const senha = 'FluxoTeste2026';
let certos = 0;
let erros = 0;
let seq = 0;

function passo(nome, condicao, detalhe = '') {
  if (condicao) certos++;
  else erros++;
  console.log(`${condicao ? 'OK   ' : 'FALHA'} ${nome}${detalhe ? ' — ' + detalhe : ''}`);
  return condicao;
}

// Cada chamada usa um X-Forwarded-For próprio para os limites de tentativa não atrapalharem.
async function chamar(metodo, caminho, { corpo, token, cru, cabecalhos = {} } = {}) {
  const headers = { 'x-forwarded-for': `10.88.${Math.floor(++seq / 250)}.${seq % 250}`, ...cabecalhos };
  if (env.BYPASS) headers['x-vercel-protection-bypass'] = env.BYPASS;
  if (corpo !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const resposta = await fetch(BASE + caminho, {
    method: metodo,
    headers,
    body: cru ?? (corpo !== undefined ? JSON.stringify(corpo) : undefined),
  });
  const texto = await resposta.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {}
  return { status: resposta.status, json, texto };
}

function cpfValido() {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9));
  for (let k = 0; k < 2; k++) {
    const soma = d.reduce((a, n, i) => a + n * (d.length + 1 - i), 0);
    d.push(((soma * 10) % 11) % 10);
  }
  return d.join('');
}

const banco = new pg.Client({ connectionString: env.DATABASE_URL_UNPOOLED });
await banco.connect();
const emailOperador = `fluxo.operador.${rodada}@bikeilha.test`;
const emailCliente = `fluxo.${rodada}@bikeilha.test`;
let token = null;

try {
  // 1. Conta e perfil do cliente
  let r = await chamar('POST', '/api/auth/cadastro', {
    corpo: { nome: `Cliente Fluxo ${rodada}`, email: emailCliente, senha, cpf: cpfValido(), aceiteTermos: true, alturaCm: 172 },
  });
  passo('cadastro 201', r.status === 201 && r.json?.data?.usuario?.perfil === 'CLIENTE', `status ${r.status}`);
  token = r.json?.data?.token;
  r = await chamar('PUT', '/api/conta/perfil-ciclista', {
    token,
    corpo: { alturaCm: 172, experiencia: 'INICIANTE', atividade: 'PASSEIO' },
  });
  passo('perfil do ciclista 200', r.status === 200, `status ${r.status}`);
  r = await chamar('GET', '/api/conta/me', { token });
  passo('conta/me traz o ciclista', r.status === 200 && r.json?.data?.ciclista?.alturaCm === 172);

  // 2. Buscar
  r = await chamar('GET', '/api/empresa');
  passo('empresa pública 200, com ponto e sem CNPJ', r.status === 200 && r.json?.data?.pontos?.length >= 1 && !('cnpj' in r.json.data));
  r = await chamar('GET', '/api/catalogo/tipos');
  passo('catálogo 200', r.status === 200 && r.json?.data?.length >= 1, `tipos ${r.json?.data?.length}`);
  const inicio = new Date(Date.now() + 15 * 60e3);
  const fim = new Date(inicio.getTime() + 2 * 3600e3);
  const consulta = `?inicio=${encodeURIComponent(inicio.toISOString())}&fim=${encodeURIComponent(fim.toISOString())}`;
  r = await chamar('GET', '/api/recomendacao' + consulta, { token });
  const resultados = r.json?.data?.resultados ?? [];
  passo(
    'recomendação 200, ordenada por pontos',
    r.status === 200 && resultados.length >= 1 && resultados.every((x, i) => i === 0 || resultados[i - 1].pontos >= x.pontos),
    `${resultados.length} tipos; topo ${resultados[0]?.nome} (${resultados[0]?.pontos} pts)`,
  );
  r = await chamar('GET', '/api/recomendacao' + consulta);
  passo('recomendação sem login 401', r.status === 401);
  const tipo = resultados[0];
  if (!tipo) throw new Error('Sem tipo livre no período: não dá para seguir o fluxo.');

  // 3. Reservar
  r = await chamar('POST', '/api/reservas', {
    token,
    corpo: { tipoId: tipo.tipoId, inicio: inicio.toISOString(), fim: fim.toISOString() },
  });
  const reserva = r.json?.data;
  passo(
    'reserva 201 PENDENTE_PAGAMENTO, valor do servidor',
    r.status === 201 && reserva?.status === 'PENDENTE_PAGAMENTO' && reserva.valorAluguelCentavos === tipo.valorAluguelCentavos,
    `status ${r.status}`,
  );
  passo('reserva não expõe a unidade ao cliente', reserva && !('bicicleta' in reserva));
  r = await chamar('GET', '/api/reservas', { token });
  passo('listar reservas inclui a nova', r.status === 200 && r.json?.data?.some((x) => x.id === reserva?.id));

  // 4. Pagar (Pix no sandbox da Stripe; o aviso é assinado aqui, como a Stripe faria)
  r = await chamar('POST', '/api/pagamentos', { token, corpo: { reservaId: reserva.id, metodo: 'PIX' } });
  passo(
    'Pix criado na Stripe 201, com QR e copia e cola',
    r.status === 201 && r.json?.data?.pix?.copiaECola && r.json?.data?.pix?.qrCodeBase64,
    `status ${r.status}${r.status === 201 ? '' : ' ' + r.texto.slice(0, 120)}`,
  );
  const pagamentoId = r.json?.data?.pagamentoId;
  r = await chamar('POST', '/api/pagamentos', { token, corpo: { reservaId: reserva.id, metodo: 'PIX' } });
  passo('repetir o pedido devolve o mesmo Pix (200)', r.status === 200 && r.json?.data?.pagamentoId === pagamentoId, `status ${r.status}`);
  r = await chamar('GET', `/api/pagamentos/${reserva.id}/status`, { token });
  passo('status PENDENTE', r.json?.data?.statusPagamento === 'PENDENTE' && r.json?.data?.statusReserva === 'PENDENTE_PAGAMENTO');
  r = await chamar('POST', '/api/pagamentos/webhook', { corpo: { type: 'payment_intent.succeeded' } });
  passo('webhook sem assinatura 401', r.status === 401, `status ${r.status}`);

  const idStripe = (await banco.query('SELECT mp_payment_id FROM pagamento WHERE id = $1', [pagamentoId])).rows[0]?.mp_payment_id;
  passo('PaymentIntent do sandbox gravado', /^pi_/.test(idStripe ?? ''));
  const evento = JSON.stringify({
    id: `evt_fluxo_${rodada}`,
    object: 'event',
    type: 'payment_intent.succeeded',
    data: { object: { id: idStripe, object: 'payment_intent', status: 'succeeded' } },
  });
  const assinatura = Stripe.webhooks.generateTestHeaderString({ payload: evento, secret: SEGREDO_WEBHOOK });
  const avisar = () =>
    chamar('POST', '/api/pagamentos/webhook', {
      cru: evento,
      cabecalhos: { 'content-type': 'application/json', 'stripe-signature': assinatura },
    });
  r = await avisar();
  passo('webhook assinado 200', r.status === 200 && r.json?.data?.recebido === true, `status ${r.status}`);
  r = await avisar();
  passo('webhook repetido 200 (idempotente)', r.status === 200, `status ${r.status}`);
  r = await chamar('GET', `/api/pagamentos/${reserva.id}/status`, { token });
  passo('reserva CONFIRMADA e pagamento APROVADO', r.json?.data?.statusReserva === 'CONFIRMADA' && r.json?.data?.statusPagamento === 'APROVADO');

  // 5. Retirar e devolver (operador próprio, para não depender das senhas do seed)
  const { ScryptDeSenha } = await import(pathToFileURL(join(raiz, 'src', 'modules', 'contas', 'infrastructure', 'senha.ts')).href);
  const pontoId = (await banco.query('SELECT id FROM ponto WHERE ativo')).rows[0]?.id ?? null;
  await banco.query(
    "INSERT INTO usuario (perfil, nome, email, senha_hash, ativo, ponto_id) VALUES ('OPERADOR', 'Operador Fluxo', $1, $2, true, $3)",
    [emailOperador, await ScryptDeSenha.padrao.gerarHash(senha), pontoId],
  );
  r = await chamar('POST', '/api/auth/login', { corpo: { email: emailOperador, senha } });
  const tokenOperador = r.json?.data?.token;
  passo('login do operador 200', r.status === 200 && r.json?.data?.usuario?.perfil === 'OPERADOR', `status ${r.status}`);
  r = await chamar('POST', `/api/operacao/reservas/${reserva.id}/retirada`, { token, corpo: {} });
  passo('retirada por CLIENTE 403', r.status === 403, `status ${r.status}`);
  r = await chamar('GET', '/api/admin/reservas?status=CONFIRMADA', { token: tokenOperador });
  const linha = r.json?.data?.find((x) => x.id === reserva.id);
  passo('painel lista a reserva com cliente e unidade', r.status === 200 && !!linha?.bicicleta?.codigo && !!linha?.cliente?.nome, `unidade ${linha?.bicicleta?.codigo}`);
  const checklist = { itens: ['freios', 'pneus', 'corrente', 'capacete'].map((nome) => ({ nome, ok: true })), observacoes: 'teste de fluxo' };
  const operar = (acao) => chamar('POST', `/api/operacao/reservas/${reserva.id}/${acao}`, { token: tokenOperador, corpo: { checklist } });
  r = await operar('retirada');
  passo('retirada 200 EM_ANDAMENTO', r.status === 200 && r.json?.data?.status === 'EM_ANDAMENTO', `status ${r.status}`);
  r = await operar('retirada');
  passo('retirada repetida 409', r.status === 409, `status ${r.status}`);
  r = await operar('devolucao');
  passo('devolução 200 CONCLUIDA', r.status === 200 && r.json?.data?.status === 'CONCLUIDA', `status ${r.status}`);
  r = await operar('devolucao');
  passo('devolução repetida 409', r.status === 409, `status ${r.status}`);
  r = await chamar('GET', `/api/reservas/${reserva.id}`, { token });
  passo('cliente vê CONCLUIDA com pagamento APROVADO', r.json?.data?.status === 'CONCLUIDA' && r.json?.data?.pagamento?.status === 'APROVADO');
  const movimentacoes = (await banco.query('SELECT count(*)::int AS n FROM movimentacao WHERE reserva_id = $1', [reserva.id])).rows[0].n;
  passo('retirada e devolução gravadas (2 movimentações)', movimentacoes === 2, `n=${movimentacoes}`);
} catch (erro) {
  passo('execução sem exceção', false, erro.message);
} finally {
  // limpeza: desativa as contas criadas
  if (token) await chamar('POST', '/api/conta/desativar', { token, corpo: {} }).catch(() => {});
  await banco.query('UPDATE usuario SET ativo = false WHERE email = ANY($1)', [[emailCliente, emailOperador]]).catch(() => {});
  await banco.end();
}

console.log(`\nResumo: ${certos} OK, ${erros} falhas`);
process.exit(erros ? 1 : 0);
