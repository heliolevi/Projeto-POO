// Verificação dos casos P0 de conta e de acesso que não têm teste automatizado com banco: cadastro,
// login, conta desativada, altura, termos, acesso sem login e webhook sem assinatura (S10).
//
// Uso (com o servidor rodando, só em ambiente LOCAL ou de desenvolvimento, nunca em produção):
//   node scripts/verificar-p0.mjs                      (usa http://localhost:3000)
//   BASE_URL=http://localhost:3001 node scripts/verificar-p0.mjs
//
// O que ele cria no banco: UMA conta verificar.*@bikeilha.test, que ele mesmo desativa no fim (é o
// próprio caso CT-CTA-14). Não cria reserva nem Pix e não chama a Stripe. Por isso ele se recusa a
// rodar contra um servidor que não seja local, a não ser com ESTRESSE_PERMITIR_REMOTO=sim.
//
// Para conferir também o /api/health/db com o segredo certo, rode com HEALTH_DB_SECRET igual ao do
// servidor. Sem ela, esse caso só confere a resposta sem segredo. O script nunca imprime tokens,
// senhas nem o segredo.
//
// A saída é uma linha por caso (OK, FALHA ou AVISO) com o ID do plano de testes, para colar no
// registro de execução de docs/plano-de-testes.md. Código de saída: 0 sem falhas, 1 com falhas.

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const HOST = new URL(BASE).hostname;
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(HOST) && process.env.ESTRESSE_PERMITIR_REMOTO !== "sim") {
  console.error(
    `Recusado: ${BASE} não é um servidor local. O script cria e desativa uma conta de teste. ` +
      "Se for mesmo um ambiente de teste, rode com ESTRESSE_PERMITIR_REMOTO=sim.",
  );
  process.exit(2);
}

const RODADA = Date.now().toString(36);
const SENHA = "Verificar2026";
const resultados = [];
let ipSeq = 0;
// Cada grupo de chamadas usa um X-Forwarded-For próprio, para os limites de tentativa (cadastro e
// login) não atrapalharem. Isso só funciona fora da Vercel, onde o IP vem de x-vercel-forwarded-for.
const ipNovo = () => `10.77.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;
const UUID_INEXISTENTE = "00000000-0000-4000-8000-000000000000";

// ok: true = passou, false = falhou, null = não deu para concluir (AVISO)
function registrar(id, ok, detalhe) {
  resultados.push({ id, ok, detalhe });
  console.log(`${ok === true ? "OK   " : ok === false ? "FALHA" : "AVISO"} ${id} — ${detalhe}`);
}

async function chamar(metodo, caminho, { corpo, token, ip = ipNovo(), cabecalhos = {}, cru } = {}) {
  const headers = { "x-forwarded-for": ip, ...cabecalhos };
  if (corpo !== undefined && cru === undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
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
    return { status: resposta.status, json, texto };
  } catch (erro) {
    return { status: 0, json: null, texto: String(erro) };
  }
}

function cpfAleatorio() {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  for (const n of [9, 10]) {
    let s = 0;
    for (let i = 0; i < n; i++) s += d[i] * (n + 1 - i);
    d.push(((s * 10) % 11) % 10);
  }
  return d.join("");
}

// Todas as chaves de um objeto JSON, em qualquer profundidade (para procurar senha ou hash na resposta).
function chaves(valor, acc = []) {
  if (Array.isArray(valor)) valor.forEach((v) => chaves(v, acc));
  else if (valor && typeof valor === "object") {
    for (const [k, v] of Object.entries(valor)) {
      acc.push(k);
      chaves(v, acc);
    }
  }
  return acc;
}

const erro = (r) => `${r.status} ${r.json?.error?.code ?? ""}`.trim();

// ---------------------------------------------------------------------------------------------
const saude = await chamar("GET", "/api/health");
if (saude.status !== 200) {
  console.error(`O servidor em ${BASE} não respondeu (${saude.status}). Rode o app antes (npm run dev ou npm start).`);
  process.exit(2);
}
console.log(`Verificação dos casos P0 em ${BASE} (rodada ${RODADA})\n`);

// --- Cadastro (CT-CAD-01, CT-CAD-11) ---
const email = `verificar.${RODADA}@bikeilha.test`;
const cpf = cpfAleatorio();
const cadastro = {
  nome: "Verificar P0",
  email,
  senha: SENHA,
  cpf,
  alturaCm: 175,
  aceiteTermos: true,
};
const criada = await chamar("POST", "/api/auth/cadastro", { corpo: cadastro });
const d = criada.json?.data;
const expiraEm = d?.expiraEm ? Date.parse(d.expiraEm) : NaN;
const horas = (expiraEm - Date.now()) / 3_600_000;
const proibidas = chaves(criada.json).filter((k) => /senha|hash|password/i.test(k));
registrar(
  "CT-CAD-01",
  criada.status === 201 &&
    typeof d?.token === "string" &&
    d?.tipo === "Bearer" &&
    horas > 23 &&
    horas < 25 &&
    d?.usuario?.perfil === "CLIENTE" &&
    proibidas.length === 0,
  `cadastro válido: ${criada.status}; tipo ${d?.tipo}; expira em ${Number.isFinite(horas) ? horas.toFixed(1) : "?"} h; perfil ${d?.usuario?.perfil}; chaves de senha/hash na resposta: ${proibidas.length}`,
);
if (criada.status !== 201) {
  console.error("\nSem a conta de teste não dá para seguir. Resposta: " + criada.texto.slice(0, 300));
  process.exit(1);
}
const token = d.token;

const mesmoEmail = await chamar("POST", "/api/auth/cadastro", { corpo: { ...cadastro, cpf: cpfAleatorio() } });
const mesmoCpf = await chamar("POST", "/api/auth/cadastro", {
  corpo: { ...cadastro, email: `verificar.${RODADA}.2@bikeilha.test` },
});
registrar(
  "CT-CAD-11",
  mesmoEmail.status === 409 && mesmoCpf.status === 409 && mesmoEmail.json?.error?.code === "CONFLICT",
  `e-mail repetido: ${erro(mesmoEmail)}; CPF repetido: ${erro(mesmoCpf)}`,
);

// --- Login (CT-LOG-01, CT-LOG-02) ---
const ipLogin = ipNovo();
const entrou = await chamar("POST", "/api/auth/login", { corpo: { email, senha: SENHA }, ip: ipLogin });
registrar(
  "CT-LOG-01",
  entrou.status === 200 &&
    typeof entrou.json?.data?.token === "string" &&
    entrou.json?.data?.tipo === "Bearer" &&
    entrou.json?.data?.usuario?.perfil === "CLIENTE",
  `login correto: ${entrou.status}`,
);
const senhaErrada = await chamar("POST", "/api/auth/login", { corpo: { email, senha: "Errada2026x" }, ip: ipLogin });
const semConta = await chamar("POST", "/api/auth/login", {
  corpo: { email: `nao.existe.${RODADA}@bikeilha.test`, senha: SENHA },
  ip: ipLogin,
});
registrar(
  "CT-LOG-02 (senha errada e e-mail inexistente)",
  senhaErrada.status === 401 &&
    semConta.status === 401 &&
    senhaErrada.json?.error?.code === semConta.json?.error?.code &&
    senhaErrada.json?.error?.message === semConta.json?.error?.message,
  `senha errada: ${erro(senhaErrada)}; e-mail inexistente: ${erro(semConta)}; a mensagem é a mesma nos dois: ${senhaErrada.json?.error?.message === semConta.json?.error?.message}`,
);

// --- Altura e termos (CT-CTA-11, CT-CTA-13) ---
const alturaOk = await chamar("POST", "/api/conta/altura", { token, corpo: { alturaCm: 172 } });
const alturaRuim = await chamar("POST", "/api/conta/altura", { token, corpo: { alturaCm: 99 } });
const perfil = await chamar("GET", "/api/conta/me", { token });
registrar(
  "CT-CTA-11",
  alturaOk.status === 204 &&
    alturaRuim.status === 400 &&
    typeof alturaRuim.json?.error?.details?.alturaCm === "string" &&
    perfil.json?.data?.ciclista?.alturaCm === 172,
  `172 cm: ${alturaOk.status}; 99 cm: ${erro(alturaRuim)} com details.alturaCm; altura gravada: ${perfil.json?.data?.ciclista?.alturaCm}`,
);
const termosOk = await chamar("POST", "/api/conta/termos", { token, corpo: { versao: "2026-11" } });
const termosRuim = await chamar("POST", "/api/conta/termos", { token, corpo: { versao: "1999-01" } });
registrar(
  "CT-CTA-13",
  termosOk.status === 204 && termosRuim.status === 400 && typeof termosRuim.json?.error?.details?.versao === "string",
  `versão vigente (2026-11): ${termosOk.status}; versão antiga: ${erro(termosRuim)} com details.versao`,
);

// --- Rotas sem login (CT-RES-16, CT-OPE-06) e perfil errado (CT-OPE-06, CT-ADM) ---
const semLogin = await Promise.all([
  chamar("GET", "/api/reservas"),
  chamar("POST", "/api/reservas", { corpo: {} }),
  chamar("GET", `/api/reservas/${UUID_INEXISTENTE}`),
  chamar("POST", `/api/reservas/${UUID_INEXISTENTE}/cancelar`, { corpo: {} }),
]);
registrar(
  "CT-RES-16 (sem login)",
  semLogin.every((r) => r.status === 401),
  `GET lista ${semLogin[0].status}, POST criar ${semLogin[1].status}, GET uma ${semLogin[2].status}, POST cancelar ${semLogin[3].status}`,
);
const operacaoSemLogin = await Promise.all([
  chamar("POST", `/api/operacao/reservas/${UUID_INEXISTENTE}/retirada`, { corpo: {} }),
  chamar("POST", `/api/operacao/reservas/${UUID_INEXISTENTE}/devolucao`, { corpo: {} }),
]);
const operacaoComoCliente = await Promise.all([
  chamar("POST", `/api/operacao/reservas/${UUID_INEXISTENTE}/retirada`, { token, corpo: {} }),
  chamar("POST", `/api/operacao/reservas/${UUID_INEXISTENTE}/devolucao`, { token, corpo: {} }),
]);
registrar(
  "CT-OPE-06",
  operacaoSemLogin.every((r) => r.status === 401) && operacaoComoCliente.every((r) => r.status === 403),
  `sem login: retirada ${operacaoSemLogin[0].status}, devolução ${operacaoSemLogin[1].status}; como CLIENTE: retirada ${operacaoComoCliente[0].status}, devolução ${operacaoComoCliente[1].status}`,
);

// --- Pagamentos (CT-PAG-04, CT-PAG-05, CT-PAG-11) ---
const metodoRuim = await chamar("POST", "/api/pagamentos", { token, corpo: { reservaId: UUID_INEXISTENTE, metodo: "BOLETO" } });
registrar(
  "CT-PAG-04",
  metodoRuim.status === 400 && typeof metodoRuim.json?.error?.details?.metodo === "string",
  `metodo BOLETO: ${erro(metodoRuim)} com details.metodo`,
);
const alheia = await chamar("POST", "/api/pagamentos", { token, corpo: { reservaId: UUID_INEXISTENTE, metodo: "PIX" } });
registrar("CT-PAG-05 (reserva inexistente)", alheia.status === 404, `Pix para uma reserva que não existe: ${erro(alheia)}`);
const webhookSemAssinatura = await chamar("POST", "/api/pagamentos/webhook", {
  cru: JSON.stringify({ id: "evt_x", type: "payment_intent.succeeded" }),
  cabecalhos: { "content-type": "application/json" },
});
const webhookAssinaturaFalsa = await chamar("POST", "/api/pagamentos/webhook", {
  cru: JSON.stringify({ id: "evt_x", type: "payment_intent.succeeded" }),
  cabecalhos: { "content-type": "application/json", "stripe-signature": "t=1,v1=00" },
});
if ([webhookSemAssinatura, webhookAssinaturaFalsa].every((r) => r.status === 401)) {
  registrar("CT-PAG-11", true, "webhook sem assinatura e com assinatura falsa: 401");
} else if ([webhookSemAssinatura, webhookAssinaturaFalsa].every((r) => r.status === 502)) {
  registrar(
    "CT-PAG-11",
    null,
    "502 nos dois: sem STRIPE_WEBHOOK_SECRET o webhook fica fechado (certo), mas o 401 só aparece com o segredo configurado",
  );
} else {
  registrar("CT-PAG-11", false, `sem assinatura: ${webhookSemAssinatura.status}; assinatura falsa: ${webhookAssinaturaFalsa.status}`);
}

// --- Saúde (CT-SEG-03, CT-SEG-04) ---
registrar(
  "CT-SEG-04",
  saude.json?.data?.status === "ok",
  `GET /api/health: ${saude.status} ${JSON.stringify(saude.json?.data ?? null)}`,
);
const dbSem = await chamar("GET", "/api/health/db");
const dbErrado = await chamar("GET", "/api/health/db", { cabecalhos: { authorization: "Bearer segredo-errado-0123456789" } });
const segredo = process.env.HEALTH_DB_SECRET;
if (!segredo) {
  registrar(
    "CT-SEG-03",
    [401, 404].includes(dbSem.status) && [401, 404].includes(dbErrado.status),
    `sem segredo: ${dbSem.status}; segredo errado: ${dbErrado.status} (o caso com o segredo certo não foi executado: HEALTH_DB_SECRET não informado)`,
  );
} else {
  const dbCerto = await chamar("GET", "/api/health/db", { cabecalhos: { authorization: `Bearer ${segredo}` } });
  const vazou = /postgres(ql)?:\/\/|password|senha/i.test(dbCerto.texto);
  registrar(
    "CT-SEG-03",
    dbSem.status === 401 && dbErrado.status === 401 && dbCerto.status === 200 && !vazou,
    `sem segredo: ${dbSem.status}; segredo errado: ${dbErrado.status}; segredo certo: ${dbCerto.status}; resposta sem URL nem senha: ${!vazou}`,
  );
}

// --- Conta desativada (CT-CTA-14, CT-SES-10) ---
const desativou = await chamar("POST", "/api/conta/desativar", { token, corpo: {} });
const tokenDepois = await chamar("GET", "/api/conta/me", { token });
const loginDepois = await chamar("POST", "/api/auth/login", { corpo: { email, senha: SENHA }, ip: ipNovo() });
registrar("CT-CTA-14", desativou.status === 204, `desativar a própria conta: ${desativou.status}`);
registrar(
  "CT-SES-10",
  tokenDepois.status === 401 && loginDepois.status === 401,
  `token da conta desativada: ${tokenDepois.status}; login com a senha certa: ${loginDepois.status}`,
);

// ---------------------------------------------------------------------------------------------
const falhas = resultados.filter((r) => r.ok === false);
const avisos = resultados.filter((r) => r.ok === null);
console.log(
  `\n${resultados.filter((r) => r.ok === true).length} de ${resultados.length} casos passaram` +
    (avisos.length ? `, ${avisos.length} com aviso (não concluídos)` : "") +
    (falhas.length ? `, ${falhas.length} falharam.` : "."),
);
if (falhas.length) {
  console.log("Falhas:\n- " + falhas.map((f) => `${f.id}: ${f.detalhe}`).join("\n- "));
  process.exit(1);
}
