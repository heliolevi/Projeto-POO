export type PerfilUsuario = "CLIENTE" | "OPERADOR" | "ADMIN";

export type Sessao = { usuarioId: string; perfil: PerfilUsuario; exp: number };

const CHAVE_TOKEN = "bik_token";
const PERFIS_VALIDOS: readonly PerfilUsuario[] = ["CLIENTE", "OPERADOR", "ADMIN"];

// Só lê o payload para montar a UI (ex.: qual menu mostrar). A API sempre confere o
// token de verdade (assinatura e conta ativa) a cada chamada, então não ter a chave
// secreta aqui não é um problema de segurança.
export function lerToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CHAVE_TOKEN);
}

export function lerSessao(): Sessao | null {
  return decodificarSessao(lerToken());
}

export function decodificarSessao(token: string | null): Sessao | null {
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
  avisarMudanca();
}

export function limparSessao(): void {
  window.localStorage.removeItem(CHAVE_TOKEN);
  avisarMudanca();
}

const EVENTO_SESSAO = "bik:sessao";

function avisarMudanca(): void {
  window.dispatchEvent(new Event(EVENTO_SESSAO));
}

// Para quem precisa reagir a login/logout (mesma aba pelo evento, outras abas pelo "storage").
export function assinarSessao(aoMudar: () => void): () => void {
  window.addEventListener(EVENTO_SESSAO, aoMudar);
  window.addEventListener("storage", aoMudar);
  return () => {
    window.removeEventListener(EVENTO_SESSAO, aoMudar);
    window.removeEventListener("storage", aoMudar);
  };
}
