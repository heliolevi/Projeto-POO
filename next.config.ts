import type { NextConfig } from "next";

// Cabeçalhos de segurança de toda resposta (T47). Não há CORS de propósito: o app e a API
// são da mesma origem, então nenhuma regra libera Access-Control-Allow-Origin.
// A política de conteúdo (CSP) só fecha o uso em iframe: uma CSP completa exige nonce nos
// scripts do Next e fica como evolução.
const CABECALHOS_SEGURANCA = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: CABECALHOS_SEGURANCA },
      // Respostas da API têm dados da conta e da reserva: nunca entram em cache.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
