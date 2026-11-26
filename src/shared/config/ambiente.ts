// Confere as variáveis de ambiente quando o servidor sobe (src/instrumentation.ts) e junta TODOS os
// problemas numa só mensagem em português, em vez de o app cair no primeiro pedido com um erro solto.
// Nunca escreve o valor de uma variável na mensagem: só o nome (o valor pode ser segredo).

export const SESSION_SECRET_MIN = 32;
export const HEALTH_DB_SECRET_MIN = 16;

// Valor de exemplo do .env.example: tem mais de 32 caracteres e passaria na checagem de tamanho,
// mas qualquer pessoa o conhece e poderia forjar tokens.
const SEGREDO_DE_EXEMPLO = "troque-por-um-valor-aleatorio";

// No MVP o Pix é sempre simulado (sem Mercado Pago). Quando a integração existir, o novo modo entra aqui.
export const PAGAMENTO_MODOS = ["simulado"] as const;
export type PagamentoModo = (typeof PAGAMENTO_MODOS)[number];

export const APP_URL_PADRAO = "http://localhost:3000";

export type VariaveisDoAmbiente = Readonly<Record<string, string | undefined>>;

/** Mensagem do problema do SESSION_SECRET, ou null se o valor serve. Usada também ao assinar tokens. */
export function problemaDoSegredoDeSessao(valor: string): string | null {
  if (valor.length < SESSION_SECRET_MIN) {
    return `SESSION_SECRET precisa ter ao menos ${SESSION_SECRET_MIN} caracteres.`;
  }
  if (valor.startsWith(SEGREDO_DE_EXEMPLO)) {
    return "SESSION_SECRET ainda está com o valor de exemplo. Gere um valor aleatório.";
  }
  return null;
}

// Variável vazia ("NOME=" no .env) conta como ausente.
function ler(env: VariaveisDoAmbiente, nome: string): string | undefined {
  const valor = env[nome]?.trim();
  return valor ? valor : undefined;
}

function problemaDoAppUrl(valor: string, producao: boolean): string | null {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return "APP_URL não é um endereço válido. Use algo como https://bike-ilha-club.vercel.app.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "APP_URL precisa começar com http:// ou https://.";
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (producao && url.protocol !== "https:" && !local) {
    return "APP_URL precisa usar https:// em produção.";
  }
  return null;
}

/**
 * Devolve a lista de problemas das variáveis (vazia se está tudo certo). Em produção, APP_URL e
 * PAGAMENTO_MODO são obrigatórios; em desenvolvimento, se faltarem, valem o padrão.
 */
export function validarAmbiente(env: VariaveisDoAmbiente, producao: boolean): string[] {
  const problemas: string[] = [];

  const bancoUrl = ler(env, "DATABASE_URL");
  if (!bancoUrl) {
    problemas.push("DATABASE_URL ausente. Cole a conexão do Neon (usuário app_login, host com -pooler).");
  } else if (!/^postgres(ql)?:\/\//.test(bancoUrl)) {
    problemas.push("DATABASE_URL precisa começar com postgresql://.");
  }

  const segredo = ler(env, "SESSION_SECRET");
  if (!segredo) {
    problemas.push("SESSION_SECRET ausente. Gere um valor aleatório (o comando está no .env.example).");
  } else {
    const problema = problemaDoSegredoDeSessao(segredo);
    if (problema) problemas.push(problema);
  }

  const saude = ler(env, "HEALTH_DB_SECRET");
  if (saude && saude.length < HEALTH_DB_SECRET_MIN) {
    problemas.push(
      `HEALTH_DB_SECRET precisa ter ao menos ${HEALTH_DB_SECRET_MIN} caracteres (ou fique em branco para desligar a rota).`,
    );
  }

  const appUrl = ler(env, "APP_URL");
  if (!appUrl) {
    if (producao) {
      problemas.push("APP_URL ausente. Informe o endereço público do app, como https://bike-ilha-club.vercel.app.");
    }
  } else {
    const problema = problemaDoAppUrl(appUrl, producao);
    if (problema) problemas.push(problema);
  }

  const modo = ler(env, "PAGAMENTO_MODO");
  if (!modo) {
    if (producao) {
      problemas.push(`PAGAMENTO_MODO ausente. No MVP o valor é "${PAGAMENTO_MODOS[0]}".`);
    }
  } else if (!(PAGAMENTO_MODOS as readonly string[]).includes(modo)) {
    problemas.push(`PAGAMENTO_MODO "${modo}" não existe. Valores aceitos: ${PAGAMENTO_MODOS.join(", ")}.`);
  }

  return problemas;
}

/** Lança um erro com todos os problemas, se houver. Chamado uma vez, quando o servidor sobe. */
export function garantirAmbiente(
  env: VariaveisDoAmbiente = process.env,
  producao: boolean = env.NODE_ENV === "production",
): void {
  const problemas = validarAmbiente(env, producao);
  if (problemas.length === 0) return;
  throw new Error(
    [
      "Configuração do ambiente inválida. Corrija as variáveis abaixo (modelo em .env.example, passo a passo em docs/ambiente-local.md):",
      ...problemas.map((problema) => ` - ${problema}`),
    ].join("\n"),
  );
}
