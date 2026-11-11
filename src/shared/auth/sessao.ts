export type PerfilUsuario = "CLIENTE" | "OPERADOR" | "ADMIN";

export type Sessao = { usuarioId: string; perfil: PerfilUsuario; exp: number };

const CHAVE_TOKEN = "bik_token";
const PERFIS_VALIDOS: readonly PerfilUsuario[] = ["CLIENTE", "OPERADOR", "ADMIN"];

// Só lê o payload para montar a UI (ex.: qual menu mostrar). A API sempre confere o
// token de verdade (assinatura e conta ativa) a cada chamada, então não ter a chave
// secreta aqui não é um problema de segurança.
export function lerSessao(): Sessao | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(CHAVE_TOKEN);
  if (!token) return null;

  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    const corpo = JSON.parse(atob(partes[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof corpo.sub !== "string" || typeof corpo.perfil !== "string") return null;
    if (!PERFIS_VALIDOS.includes(corpo.perfil as PerfilUsuario)) return null;
    if (typeof corpo.exp !== "number" || corpo.exp <= Date.now() / 1000) return null;
    return { usuarioId: corpo.sub, perfil: corpo.perfil as PerfilUsuario, exp: corpo.exp };
  } catch {
    return null;
  }
}

export function salvarSessao(token: string): void {
  // MVP: ver ticket de hardening
  window.localStorage.setItem(CHAVE_TOKEN, token);
}

export function limparSessao(): void {
  window.localStorage.removeItem(CHAVE_TOKEN);
}
