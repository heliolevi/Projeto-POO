// Teste de estresse da API: tenta quebrar o sistema com concorrência, abuso e entradas ruins, e
// confere invariantes (nunca 500, nunca duas reservas na mesma bicicleta, nunca dois Pix na mesma
// reserva, limites de tentativa funcionando).
//
// Uso (com o servidor rodando, só em ambiente LOCAL ou de desenvolvimento, nunca em produção):
//   node scripts/teste-de-estresse.mjs                 (usa http://localhost:3000)
//   BASE_URL=http://localhost:3001 node scripts/teste-de-estresse.mjs
//
// O que ele cria no banco: contas estresse.*@bikeilha.test, reservas (canceladas no fim) e, se a
// Stripe estiver configurada, Pix de TESTE (sk_test_). O script não sabe a chave do servidor antes de
// pedir um Pix: se o primeiro Pix vier pagável em banco (chave sk_live_), ele para ali, sem consultar
// nem criar mais nada. Com sk_live_, então, fica no máximo UM Pix de verdade, que não deve ser pago e
// vence em 15 minutos. Por isso ele se recusa a rodar contra um servidor que não seja local, a não
// ser com ESTRESSE_PERMITIR_REMOTO=sim.
//
// Para não travar o login de quem está usando o mesmo computador, cada cenário usa um
// X-Forwarded-For próprio. (Isso só funciona fora da Vercel: lá o IP vem de x-vercel-forwarded-for.)

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const HOST = new URL(BASE).hostname;
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(HOST) && process.env.ESTRESSE_PERMITIR_REMOTO !== "sim") {
  console.error(
    `Recusado: ${BASE} não é um servidor local. O teste cria contas, reservas e Pix. ` +
      "Se for mesmo um ambiente de teste, rode com ESTRESSE_PERMITIR_REMOTO=sim.",
  );
  process.exit(2);
}
const RODADA = Date.now().toString(36);
const falhas = [];
const resultados = [];
let ipSeq = 0;
const ipNovo = () => `10.${(RODADA.length * 7) % 255}.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;

function registrar(cenario, ok, detalhe) {
  resultados.push({ cenario, ok, detalhe });
  if (!ok) falhas.push(`${cenario}: ${detalhe}`);
  console.log(`${ok ? "OK  " : "FALHA"} ${cenario} — ${detalhe}`);
}

async function chamar(metodo, caminho, { corpo, token, ip, cabecalhos = {}, cru } = {}) {
  const inicio = performance.now();
  const headers = { ...cabecalhos };
  if (corpo !== undefined && cru === undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  if (ip) headers["x-forwarded-for"] = ip;
  try {
    const resposta = await fetch(BASE + caminho, {
      method: metodo,
      headers,
      body: cru !== undefined ? cru : corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    const texto = await resposta.text();
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch {}
    return { status: resposta.status, json, ms: performance.now() - inicio, texto, retryAfter: resposta.headers.get("retry-after") };
  } catch (erro) {
    return { status: 0, json: null, ms: performance.now() - inicio, texto: String(erro), retryAfter: null };
  }
}

async function emParalelo(n, fn, limite = n) {
  const saidas = new Array(n);
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(limite, n) }, async () => {
      while (proximo < n) {
        const i = proximo++;
        saidas[i] = await fn(i);
      }
    }),
  );
  return saidas;
}

const contar = (lista) =>
  lista.reduce((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
const percentil = (valores, p) => {
  const ordenado = [...valores].sort((a, b) => a - b);
  return ordenado[Math.min(ordenado.length - 1, Math.floor((p / 100) * ordenado.length))] ?? 0;
};

function cpfAleatorio() {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  for (const n of [9, 10]) {
    let s = 0;
    for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i);
    d.push(((s * 10) % 11) % 10);
  }
  return d.join("");
}

async function novaConta(rotulo) {
  const email = `estresse.${RODADA}.${rotulo}@bikeilha.test`;
  const r = await chamar("POST", "/api/auth/cadastro", {
    ip: ipNovo(),
    corpo: {
      nome: `Estresse ${rotulo}`,
      email,
      senha: "Estresse2026",
      cpf: cpfAleatorio(),
      alturaCm: 175,
      aceiteTermos: true,
    },
  });
  if (r.status !== 201) throw new Error(`cadastro ${rotulo} deu ${r.status}: ${r.texto.slice(0, 200)}`);
  return { email, token: r.json.data.token, id: r.json.data.usuario.id };
}

// Período de 2 horas num dia aleatório 20 a 80 dias à frente, às 13h UTC (10h em Brasília), para
// não cruzar com reservas de verdade nem com rodadas anteriores.
function periodoAleatorio() {
  const dia = new Date();
  dia.setUTCDate(dia.getUTCDate() + 20 + Math.floor(Math.random() * 60));
  dia.setUTCHours(13, Math.floor(Math.random() * 4) * 15, 0, 0);
  const fim = new Date(dia.getTime() + 2 * 60 * 60 * 1000);
  return { inicio: dia.toISOString(), fim: fim.toISOString() };
}

const reservasCriadas = [];

// ------------------------------------------------------------------------------------------------
async function cenarioCargaPublica() {
  const n = 400;
  const saidas = await emParalelo(n, (i) => chamar("GET", i % 2 ? "/api/catalogo/tipos" : "/api/empresa"), 40);
  const erros = saidas.filter((r) => r.status !== 200);
  const ms = saidas.map((r) => r.ms);
  registrar(
    "carga: 400 GETs públicos, 40 de cada vez",
    erros.length === 0,
    `status ${JSON.stringify(contar(saidas))}, p50 ${percentil(ms, 50).toFixed(0)} ms, p95 ${percentil(ms, 95).toFixed(0)} ms, máx ${Math.max(...ms).toFixed(0)} ms`,
  );
}

async function cenarioEntradasRuins(token) {
  const lixo = [
    ["POST", "/api/auth/login", { cru: "{isso não é json", cabecalhos: { "content-type": "application/json" } }],
    ["POST", "/api/auth/login", { corpo: [] }],
    ["POST", "/api/auth/login", { corpo: null }],
    ["POST", "/api/auth/login", { corpo: { email: "' OR 1=1 --", senha: "x' OR '1'='1" } }],
    ["POST", "/api/auth/login", { corpo: { email: { $ne: null }, senha: { $gt: "" } } }],
    ["POST", "/api/auth/login", { corpo: { email: "a@b.c", senha: "x".repeat(100_000) } }],
    ["POST", "/api/auth/cadastro", { corpo: { nome: "\u0000".repeat(50), email: "😀@😀.😀", senha: "a1".repeat(80), cpf: "000.000.000-00", aceiteTermos: "true" } }],
    ["POST", "/api/auth/cadastro", { cru: "x".repeat(2_000_000), cabecalhos: { "content-type": "application/json" } }],
    ["GET", "/api/reservas/not-a-uuid", { token }],
    ["GET", "/api/reservas/00000000-0000-0000-0000-000000000000", { token }],
    ["GET", "/api/reservas/'%3B%20DROP%20TABLE%20reserva%3B--", { token }],
    ["POST", "/api/reservas", { token, corpo: { tipoId: "x", inicio: "ontem", fim: "amanhã" } }],
    ["POST", "/api/reservas", { token, corpo: { tipoId: "00000000-0000-0000-0000-000000000000", inicio: "2020-01-01T00:00:00Z", fim: "2020-01-01T01:00:00Z" } }],
    ["POST", "/api/reservas", { token, corpo: { tipoId: "00000000-0000-0000-0000-000000000000", inicio: "+275760-09-13T00:00:00Z", fim: "+275760-09-13T01:00:00Z" } }],
    ["POST", "/api/reservas", { token, corpo: { tipoId: "00000000-0000-0000-0000-000000000000", inicio: 1e308, fim: -1 } }],
    ["GET", "/api/recomendacao?inicio=abc&fim=def", { token }],
    ["GET", "/api/recomendacao?inicio=2099-01-01T00:00:00Z&fim=2099-03-01T00:00:00Z", { token }],
    ["GET", `/api/recomendacao?inicio=${"9".repeat(5000)}&fim=1`, { token }],
    ["POST", "/api/pagamentos", { token, corpo: { reservaId: "../../etc/passwd", metodo: "PIX" } }],
    ["POST", "/api/pagamentos", { token, corpo: { reservaId: "00000000-0000-0000-0000-000000000000", metodo: "BITCOIN" } }],
    ["POST", "/api/pagamentos", { token, corpo: { reservaId: "00000000-0000-0000-0000-000000000000", metodo: "PIX", valorCentavos: 1 } }],
    ["GET", "/api/pagamentos/xyz/status", { token }],
    ["PUT", "/api/conta/perfil-ciclista", { token, corpo: { alturaCm: "175", perfil: "ADMIN" } }],
    // texto cru: num objeto literal, __proto__ muda o protótipo em vez de virar chave, e some no JSON
    ["PUT", "/api/conta/perfil-ciclista", { token, cru: '{"__proto__":{"admin":true},"alturaCm":175}', cabecalhos: { "content-type": "application/json" } }],
    ["POST", "/api/pagamentos/webhook", { cru: "{}", cabecalhos: { "stripe-signature": "t=1,v1=falsa" } }],
    ["POST", "/api/pagamentos/webhook", { cru: "x".repeat(200_000), cabecalhos: { "stripe-signature": "t=1,v1=falsa" } }],
  ];
  const saidas = await emParalelo(lixo.length, (i) => chamar(lixo[i][0], lixo[i][1], { ip: ipNovo(), ...lixo[i][2] }), 8);
  const quinhentos = saidas
    .map((r, i) => ({ r, i }))
    // o 502 do webhook é esperado quando STRIPE_WEBHOOK_SECRET não está configurado
    .filter(({ r, i }) => r.status >= 500 && !(r.status === 502 && lixo[i][1].includes("webhook")));
  registrar(
    `entradas ruins: ${lixo.length} corpos e ids maliciosos ou quebrados`,
    // status 0 = a conexão caiu; só vale para o corpo de 2 MB (o servidor pode fechar sem ler tudo)
    quinhentos.length === 0 && saidas.every((r, i) => r.status !== 0 || (lixo[i][2].cru?.length ?? 0) >= 1_000_000),
    quinhentos.length
      ? `deram 5xx: ${quinhentos.map(({ r, i }) => `${lixo[i][0]} ${lixo[i][1].slice(0, 40)} -> ${r.status}`).join("; ")}`
      : `nenhum 500; status ${JSON.stringify(contar(saidas))}`,
  );
  const webhook = saidas.slice(-2).map((r) => r.status);
  registrar(
    "webhook com assinatura falsa é recusado",
    webhook.every((s) => s === 401 || s === 413 || s === 502),
    `status ${webhook.join(", ")} (401 = assinatura recusada; 502 = STRIPE_WEBHOOK_SECRET ausente neste ambiente)`,
  );
}

async function cenarioTokens(cliente) {
  const [cab, corpo, assinatura] = cliente.token.split(".");
  const corpoAdmin = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(corpo, "base64url").toString()), perfil: "ADMIN" }),
  ).toString("base64url");
  const semAlg = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const tentativas = [
    ["token vazio", ""],
    ["lixo", "abc.def.ghi"],
    ["perfil trocado para ADMIN no corpo", `${cab}.${corpoAdmin}.${assinatura}`],
    ["alg none", `${semAlg}.${corpoAdmin}.`],
    ["assinatura de outro corpo", `${cab}.${corpoAdmin}.${assinatura.split("").reverse().join("")}`],
  ];
  const saidas = await Promise.all(tentativas.map(([, t]) => chamar("GET", "/api/admin/tipos", { token: t })));
  registrar(
    "tokens forjados não entram no painel do admin",
    saidas.every((r) => r.status === 401),
    tentativas.map(([nome], i) => `${nome}: ${saidas[i].status}`).join("; "),
  );
  const proibido = await chamar("GET", "/api/admin/tipos", { token: cliente.token });
  registrar("cliente de verdade no painel do admin recebe 403", proibido.status === 403, `status ${proibido.status}`);
}

async function cenarioForcaBruta() {
  const conta = await novaConta("bruta");
  const ip = ipNovo();
  const saidas = [];
  for (let i = 0; i < 14; i++) {
    saidas.push(await chamar("POST", "/api/auth/login", { ip, corpo: { email: conta.email, senha: `Errada${i}x` } }));
  }
  const status = saidas.map((r) => r.status);
  const primeiro429 = status.indexOf(429);
  registrar(
    "força bruta: 14 senhas erradas do mesmo IP na mesma conta",
    primeiro429 > 0 && primeiro429 <= 11 && status.slice(0, primeiro429).every((s) => s === 401),
    `status ${status.join(",")}; bloqueia a partir da tentativa ${primeiro429 + 1}; Retry-After presente: ${saidas[primeiro429]?.retryAfter ? `sim (${saidas[primeiro429].retryAfter} s)` : "não"}`,
  );
  // mesma conta, outro IP: a senha certa ainda entra (um estranho não tranca a conta de outra pessoa)
  const certo = await chamar("POST", "/api/auth/login", { ip: ipNovo(), corpo: { email: conta.email, senha: "Estresse2026" } });
  registrar("depois da força bruta, o dono entra de outro IP", certo.status === 200, `status ${certo.status}`);

  // X-Forwarded-For trocado a cada tentativa: o limite por e-mail (100) ainda segura
  const rotativo = await emParalelo(
    40,
    () => chamar("POST", "/api/auth/login", { ip: ipNovo(), corpo: { email: conta.email, senha: "ErradaDeNovo1" } }),
    10,
  );
  registrar(
    "força bruta trocando o X-Forwarded-For (40 IPs falsos)",
    rotativo.every((r) => r.status === 401 || r.status === 429),
    `status ${JSON.stringify(contar(rotativo))}. Atenção: fora da Vercel o limite por IP confia no X-Forwarded-For enviado pelo cliente; só o limite por e-mail (100 em 15 min) segura este ataque`,
  );
}

async function cenarioCorridaReserva(clientes) {
  const { inicio, fim } = periodoAleatorio();
  const recomendacao = await chamar(
    "GET",
    `/api/recomendacao?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`,
    { token: clientes[0].token },
  );
  if (recomendacao.status !== 200) {
    registrar("corrida por bicicleta", false, `recomendação deu ${recomendacao.status}: ${recomendacao.texto.slice(0, 200)}`);
    return null;
  }
  const tipos = recomendacao.json.data.resultados;
  if (tipos.length === 0) {
    registrar("corrida por bicicleta", false, "nenhum tipo livre no período sorteado");
    return null;
  }
  // o tipo com menos unidades livres: é onde a corrida é mais apertada
  const alvo = [...tipos].sort((a, b) => a.unidadesLivres - b.unidadesLivres)[0];
  // o limite é de 20 reservas por hora por cliente: não passa disso, para o 429 não confundir a conta
  const tentativas = Math.min(alvo.unidadesLivres + 8, clientes.length * 15);
  const saidas = await emParalelo(
    tentativas,
    (i) => chamar("POST", "/api/reservas", { token: clientes[i % clientes.length].token, corpo: { tipoId: alvo.tipoId, inicio, fim } }),
    tentativas,
  );
  for (const [i, r] of saidas.entries()) {
    if (r.status === 201) reservasCriadas.push({ id: r.json.data.id, token: clientes[i % clientes.length].token });
  }
  const criadas = saidas.filter((r) => r.status === 201).length;
  const semVaga = saidas.filter((r) => r.status === 409).length;
  const limitadas = saidas.filter((r) => r.status === 429).length;
  const depois = await chamar(
    "GET",
    `/api/recomendacao?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`,
    { token: clientes[0].token },
  );
  const sobra = depois.json?.data?.resultados?.find((t) => t.tipoId === alvo.tipoId)?.unidadesLivres ?? 0;
  registrar(
    `corrida: ${tentativas} reservas ao mesmo tempo para "${alvo.nome}" com ${alvo.unidadesLivres} livre(s)`,
    criadas + semVaga + limitadas === tentativas &&
      criadas <= alvo.unidadesLivres &&
      (limitadas > 0 || (criadas === Math.min(alvo.unidadesLivres, tentativas) && sobra === Math.max(0, alvo.unidadesLivres - tentativas))),
    `criadas ${criadas}, recusadas com 409 ${semVaga}, limite (429) ${limitadas}, outros ${JSON.stringify(contar(saidas.filter((r) => ![201, 409, 429].includes(r.status))))}; livres depois: ${sobra}`,
  );
  return reservasCriadas[0] ?? null;
}

async function cenarioCorridaPix(reserva) {
  if (!reserva) return registrar("corrida no Pix", false, "sem reserva para pagar");
  const saidas = await emParalelo(25, () => chamar("POST", "/api/pagamentos", { token: reserva.token, corpo: { reservaId: reserva.id, metodo: "PIX" } }), 25);
  const sucesso = saidas.filter((r) => r.status === 200 || r.status === 201);
  if (saidas.every((r) => r.status === 502)) {
    return registrar("corrida no Pix", true, "Stripe não configurada neste ambiente (502 em todas): nada a conferir");
  }
  const ids = new Set(sucesso.map((r) => r.json.data.pagamentoId));
  const codigos = new Set(sucesso.map((r) => r.json.data.pix.copiaECola));
  const criadas201 = saidas.filter((r) => r.status === 201).length;
  registrar(
    "corrida: 25 pedidos de Pix ao mesmo tempo na mesma reserva",
    sucesso.length > 0 && ids.size === 1 && codigos.size === 1 && criadas201 === 1 && saidas.every((r) => r.status < 500),
    `status ${JSON.stringify(contar(saidas))}; pagamentos distintos ${ids.size}; copia e cola distintos ${codigos.size} (o 429 é o limite de 10 cobranças por hora por cliente)`,
  );
  const pix = sucesso[0]?.json?.data?.pix;
  if (pix?.pagavelEmBanco === true) {
    return registrar(
      "parada: o servidor está com a chave de PRODUÇÃO",
      false,
      "o Pix criado é pagável em banco (sk_live_). NÃO pague esse Pix: ele vence em 15 minutos. Nada mais foi pedido.",
    );
  }
  if (pix) {
    registrar(
      "o Pix diz se é pagável em banco",
      typeof pix.pagavelEmBanco === "boolean" || pix.pagavelEmBanco === undefined,
      pix.pagavelEmBanco === undefined
        ? "servidor ainda sem o campo pagavelEmBanco (rodando código anterior a esta mudança)"
        : `pagavelEmBanco = ${pix.pagavelEmBanco}${pix.pagavelEmBanco ? "" : " (chave sk_test_: código fictício da Stripe)"}`,
    );
  }
  const status = await emParalelo(60, () => chamar("GET", `/api/pagamentos/${reserva.id}/status`, { token: reserva.token }), 20);
  registrar(
    "60 consultas de status do Pix (a tela consulta a cada 3 s)",
    status.every((r) => r.status === 200),
    `status ${JSON.stringify(contar(status))}, p95 ${percentil(status.map((r) => r.ms), 95).toFixed(0)} ms`,
  );
}

async function cenarioIsolamento(clientes) {
  const alheia = reservasCriadas.find((r) => r.token !== clientes[1].token);
  if (!alheia) return registrar("isolamento entre clientes", true, "sem reserva de outro cliente para testar");
  const [ler, pagar, cancelar, status] = await Promise.all([
    chamar("GET", `/api/reservas/${alheia.id}`, { token: clientes[1].token }),
    chamar("POST", "/api/pagamentos", { token: clientes[1].token, corpo: { reservaId: alheia.id, metodo: "PIX" } }),
    chamar("POST", `/api/reservas/${alheia.id}/cancelar`, { token: clientes[1].token, corpo: {} }),
    chamar("GET", `/api/pagamentos/${alheia.id}/status`, { token: clientes[1].token }),
  ]);
  registrar(
    "cliente B não lê, não paga, não cancela e não vê o status da reserva do cliente A",
    [ler, pagar, cancelar, status].every((r) => r.status === 404),
    `ler ${ler.status}, pagar ${pagar.status}, cancelar ${cancelar.status}, status ${status.status}`,
  );
}

async function limpar() {
  const saidas = await emParalelo(reservasCriadas.length, (i) =>
    chamar("POST", `/api/reservas/${reservasCriadas[i].id}/cancelar`, { token: reservasCriadas[i].token, corpo: {} }),
    10,
  );
  console.log(`limpeza: ${reservasCriadas.length} reserva(s) cancelada(s): ${JSON.stringify(contar(saidas))}`);
}

// ------------------------------------------------------------------------------------------------
const saude = await chamar("GET", "/api/health");
if (saude.status !== 200) {
  console.error(`O servidor em ${BASE} não respondeu (${saude.status}). Rode npm run dev antes.`);
  process.exit(2);
}
console.log(`Teste de estresse em ${BASE} (rodada ${RODADA})\n`);

const clientes = [];
for (const rotulo of ["a", "b", "c", "d"]) clientes.push(await novaConta(rotulo));

try {
  await cenarioCargaPublica();
  await cenarioEntradasRuins(clientes[0].token);
  await cenarioTokens(clientes[0]);
  await cenarioForcaBruta();
  const reserva = await cenarioCorridaReserva(clientes);
  await cenarioIsolamento(clientes);
  await cenarioCorridaPix(reserva);
} finally {
  await limpar();
}

console.log(`\n${resultados.length - falhas.length} de ${resultados.length} cenários passaram.`);
if (falhas.length) {
  console.log("Falhas:\n- " + falhas.join("\n- "));
  process.exit(1);
}
