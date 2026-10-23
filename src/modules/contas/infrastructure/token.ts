import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/shared/config/env";
import type { PerfilUsuario } from "../domain/usuario";

// Token de sessão: JWT HS256 assinado com SESSION_SECRET. Sem estado no banco,
// então não dá para revogar antes de expirar (por isso a duração é curta).
export const DURACAO_SESSAO_SEGUNDOS = 60 * 60 * 24;

export type SessaoToken = { sub: string; perfil: PerfilUsuario; iat: number; exp: number };

function segredo(): string {
  const valor = requireEnv("SESSION_SECRET");
  if (valor.length < 32) {
    throw new Error("SESSION_SECRET precisa ter ao menos 32 caracteres.");
  }
  return valor;
}

const b64 = (dados: string | Buffer) => Buffer.from(dados).toString("base64url");
const assinar = (conteudo: string) =>
  createHmac("sha256", segredo()).update(conteudo).digest();

export function emitirToken(usuario: { id: string; perfil: PerfilUsuario }) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + DURACAO_SESSAO_SEGUNDOS;
  const cabecalho = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const corpo = b64(JSON.stringify({ sub: usuario.id, perfil: usuario.perfil, iat, exp }));
  const conteudo = `${cabecalho}.${corpo}`;
  return { token: `${conteudo}.${b64(assinar(conteudo))}`, expiraEm: new Date(exp * 1000) };
}

export function verificarToken(token: string): SessaoToken | null {
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [cabecalho, corpo, assinatura] = partes;
  const esperada = assinar(`${cabecalho}.${corpo}`);
  const recebida = Buffer.from(assinatura, "base64url");
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) {
    return null;
  }
  try {
    const cab = JSON.parse(Buffer.from(cabecalho, "base64url").toString());
    if (cab.alg !== "HS256") return null;
    const sessao = JSON.parse(Buffer.from(corpo, "base64url").toString()) as SessaoToken;
    if (typeof sessao.sub !== "string" || sessao.exp <= Date.now() / 1000) return null;
    return sessao;
  } catch {
    return null;
  }
}
