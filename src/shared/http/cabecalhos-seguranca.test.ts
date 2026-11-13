import assert from "node:assert/strict";
import { describe, it } from "node:test";
import nextConfig from "../../../next.config.ts";

async function cabecalhosDe(origem: string): Promise<Record<string, string>> {
  const regras = (await nextConfig.headers?.()) ?? [];
  const resultado: Record<string, string> = {};
  for (const regra of regras) {
    if (regra.source !== origem) continue;
    for (const { key, value } of regra.headers) resultado[key] = value;
  }
  return resultado;
}

describe("cabeçalhos de segurança do app", () => {
  it("toda rota recusa ser exibida em iframe e adivinhar tipo de arquivo", async () => {
    const h = await cabecalhosDe("/:path*");
    assert.equal(h["X-Content-Type-Options"], "nosniff");
    assert.equal(h["X-Frame-Options"], "DENY");
    assert.equal(h["Content-Security-Policy"], "frame-ancestors 'none'");
  });

  it("não vaza a URL completa para outros sites e fecha recursos do aparelho", async () => {
    const h = await cabecalhosDe("/:path*");
    assert.equal(h["Referrer-Policy"], "strict-origin-when-cross-origin");
    assert.match(h["Permissions-Policy"], /camera=\(\)/);
    assert.match(h["Permissions-Policy"], /microphone=\(\)/);
    assert.match(h["Permissions-Policy"], /geolocation=\(\)/);
  });

  it("força HTTPS por dois anos", async () => {
    const h = await cabecalhosDe("/:path*");
    assert.match(h["Strict-Transport-Security"], /max-age=63072000/);
  });

  it("a API nunca é guardada em cache", async () => {
    const h = await cabecalhosDe("/api/:path*");
    assert.equal(h["Cache-Control"], "no-store");
  });

  it("não libera CORS: nenhuma regra define Access-Control-Allow-Origin", async () => {
    const regras = (await nextConfig.headers?.()) ?? [];
    const chaves = regras.flatMap((r) => r.headers.map((h) => h.key.toLowerCase()));
    assert.ok(!chaves.some((c) => c.startsWith("access-control-")));
  });
});
