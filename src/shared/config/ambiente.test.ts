import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { garantirAmbiente, validarAmbiente } from "./ambiente.ts";

// Valores de mentira só para o teste (nenhum é segredo de verdade).
const SEGREDO = "x".repeat(48);
const BASE = {
  DATABASE_URL: "postgresql://usuario:senha@localhost:5432/banco",
  SESSION_SECRET: SEGREDO,
};
const PRODUCAO = {
  ...BASE,
  APP_URL: "https://bike-ilha-club.vercel.app",
  PAGAMENTO_MODO: "simulado",
};

test("desenvolvimento: só DATABASE_URL e SESSION_SECRET bastam (APP_URL e PAGAMENTO_MODO têm padrão)", () => {
  assert.deepEqual(validarAmbiente(BASE, false), []);
});

test("produção com tudo certo não tem problema", () => {
  assert.deepEqual(validarAmbiente(PRODUCAO, true), []);
});

test("produção sem APP_URL e sem PAGAMENTO_MODO lista os dois", () => {
  const problemas = validarAmbiente(BASE, true);
  assert.equal(problemas.length, 2);
  assert.match(problemas[0], /^APP_URL ausente/);
  assert.match(problemas[1], /^PAGAMENTO_MODO ausente/);
});

test("variável vazia ('NOME=' no .env) conta como ausente", () => {
  const problemas = validarAmbiente({ ...BASE, SESSION_SECRET: "   ", DATABASE_URL: "" }, false);
  assert.equal(problemas.length, 2);
  assert.match(problemas.join("\n"), /DATABASE_URL ausente/);
  assert.match(problemas.join("\n"), /SESSION_SECRET ausente/);
});

test("SESSION_SECRET curto ou igual ao exemplo é recusado", () => {
  assert.match(validarAmbiente({ ...BASE, SESSION_SECRET: "curto" }, false)[0], /32 caracteres/);
  const exemplo = "troque-por-um-valor-aleatorio-com-pelo-menos-32-caracteres";
  assert.match(validarAmbiente({ ...BASE, SESSION_SECRET: exemplo }, false)[0], /valor de exemplo/);
});

test("DATABASE_URL precisa ser uma conexão postgres", () => {
  assert.match(validarAmbiente({ ...BASE, DATABASE_URL: "mysql://x" }, false)[0], /postgresql:\/\//);
  assert.deepEqual(validarAmbiente({ ...BASE, DATABASE_URL: "postgres://u:p@h/db" }, false), []);
});

test("HEALTH_DB_SECRET é opcional, mas curto demais é recusado", () => {
  assert.deepEqual(validarAmbiente({ ...BASE, HEALTH_DB_SECRET: "" }, false), []);
  assert.deepEqual(validarAmbiente({ ...BASE, HEALTH_DB_SECRET: "a".repeat(16) }, false), []);
  assert.match(validarAmbiente({ ...BASE, HEALTH_DB_SECRET: "curto" }, false)[0], /16 caracteres/);
});

test("APP_URL: endereço inválido, outro protocolo e http em produção são recusados", () => {
  assert.match(validarAmbiente({ ...PRODUCAO, APP_URL: "bike-ilha" }, true)[0], /não é um endereço válido/);
  assert.match(validarAmbiente({ ...PRODUCAO, APP_URL: "ftp://exemplo.com" }, true)[0], /http:\/\/ ou https:\/\//);
  assert.match(validarAmbiente({ ...PRODUCAO, APP_URL: "http://exemplo.com" }, true)[0], /https/);
});

test("APP_URL: http é aceito em desenvolvimento e em localhost, mesmo em produção", () => {
  assert.deepEqual(validarAmbiente({ ...BASE, APP_URL: "http://exemplo.com" }, false), []);
  assert.deepEqual(validarAmbiente({ ...PRODUCAO, APP_URL: "http://localhost:3000" }, true), []);
});

test("PAGAMENTO_MODO só aceita os modos que existem", () => {
  const problemas = validarAmbiente({ ...PRODUCAO, PAGAMENTO_MODO: "real" }, true);
  assert.equal(problemas.length, 1);
  assert.match(problemas[0], /"real" não existe\. Valores aceitos: simulado/);
});

test("garantirAmbiente junta todos os problemas numa mensagem e não mostra o valor dos segredos", () => {
  const env = { DATABASE_URL: "", SESSION_SECRET: "senha-curta-secreta", PAGAMENTO_MODO: "real" };
  assert.throws(
    () => garantirAmbiente(env, true),
    (erro: Error) => {
      assert.match(erro.message, /^Configuração do ambiente inválida/);
      for (const nome of ["DATABASE_URL", "SESSION_SECRET", "APP_URL", "PAGAMENTO_MODO"]) {
        assert.match(erro.message, new RegExp(` - ${nome}`), nome);
      }
      assert.ok(!erro.message.includes("senha-curta-secreta"), "o valor do segredo vazou na mensagem");
      return true;
    },
  );
});

test("garantirAmbiente não lança com o ambiente certo", () => {
  assert.doesNotThrow(() => garantirAmbiente(PRODUCAO, true));
  assert.doesNotThrow(() => garantirAmbiente(BASE, false));
});

// CT-SEG-10: toda variável que o código lê está no .env.example (modelo para quem monta o ambiente).
function arquivosDeCodigo(pasta: string): string[] {
  return (readdirSync(pasta, { recursive: true, encoding: "utf8" }) as string[])
    .filter((caminho) => /\.(ts|tsx|mjs)$/.test(caminho) && !/\.test\./.test(caminho))
    .filter((caminho) => !/(^|[\\/])(node_modules|\.next)([\\/]|$)/.test(caminho))
    .map((caminho) => join(pasta, caminho));
}

const DO_SISTEMA = new Set(["NODE_ENV", "NEXT_RUNTIME", "NEXT_PHASE", "CI"]);

test("CT-SEG-10: toda variável lida pelo código está no .env.example", () => {
  const modelo = readFileSync(".env.example", "utf8");
  const usadas = new Map<string, string>();
  for (const pasta of ["src", "db", "scripts"]) {
    for (const arquivo of arquivosDeCodigo(pasta)) {
      const codigo = readFileSync(arquivo, "utf8");
      const nomes = [
        ...codigo.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g),
        ...codigo.matchAll(/process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g),
        ...codigo.matchAll(/requireEnv\(["']([A-Z][A-Z0-9_]*)["']\)/g),
      ].map((m) => m[1]);
      for (const nome of nomes) {
        if (!DO_SISTEMA.has(nome) && !nome.startsWith("VERCEL")) usadas.set(nome, arquivo);
      }
    }
  }
  // As que o validador confere também precisam estar listadas, mesmo sem aparecer como process.env.X.
  for (const nome of ["APP_URL", "PAGAMENTO_MODO"]) usadas.set(nome, "src/shared/config/ambiente.ts");

  const faltando = [...usadas]
    .filter(([nome]) => !new RegExp(`^#?\\s*${nome}=`, "m").test(modelo))
    .map(([nome, arquivo]) => `${nome} (usada em ${arquivo})`);
  assert.deepEqual(faltando, [], "variável usada pelo código e ausente do .env.example");
});

test("o .env.example não vem com segredo de verdade: o SESSION_SECRET de exemplo é recusado", () => {
  const modelo = readFileSync(".env.example", "utf8");
  const problemas = validarAmbiente(lerModelo(modelo), true);
  assert.ok(problemas.some((p) => /SESSION_SECRET ainda está com o valor de exemplo/.test(p)), problemas.join(" | "));
  assert.match(modelo, /^HEALTH_DB_SECRET=\s*$/m);
});

function lerModelo(texto: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(linha);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}
