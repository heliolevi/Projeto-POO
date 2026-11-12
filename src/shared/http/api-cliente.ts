export type ErrosPorCampo = Record<string, string>;

export type UsuarioAutenticado = {
  id: string;
  perfil: "CLIENTE" | "OPERADOR" | "ADMIN";
  nome: string;
  email: string;
};

export type ResultadoSessao = {
  token: string;
  tipo: "Bearer";
  expiraEm: string;
  usuario: UsuarioAutenticado;
};

export class ApiError extends Error {
  code: string;
  details?: ErrosPorCampo;

  constructor(code: string, message: string, details?: ErrosPorCampo) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

async function enviar<T>(url: string, init: RequestInit): Promise<T> {
  const resposta = await fetch(url, init);
  const json = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    const erro = json?.error ?? { code: "UNKNOWN", message: "Não foi possível completar a ação." };
    throw new ApiError(erro.code, erro.message, erro.details);
  }

  // 204 (senha, altura, desativar) não tem corpo: sucesso sem dados.
  return (json?.data ?? undefined) as T;
}

export function postJson<T>(url: string, corpo: unknown): Promise<T> {
  return enviar<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

// Rotas que exigem login mandam o token da sessão em Authorization.
// (Mesma chave de localStorage usada em shared/auth/sessao.)
function cabecalhoAutenticado(): Record<string, string> {
  const token = typeof window === "undefined" ? null : window.localStorage.getItem("bik_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Token recusado pela API (revogado, conta inativa ou expirado): apaga a sessão e leva para o
// login, guardando a tela atual em ?next= para voltar depois de entrar de novo.
function sessaoRecusada(): void {
  window.localStorage.removeItem("bik_token");
  const origem = window.location.pathname + window.location.search;
  const login = new URL("/login", window.location.origin);
  login.searchParams.set("next", origem);
  window.location.assign(login.href);
}

type OpcoesAutenticado = {
  // Padrão: um 401 derruba a sessão e leva ao login. A troca de senha desliga isso, porque lá
  // o 401 também quer dizer "senha atual incorreta" e a pessoa deve continuar logada.
  sairSeNaoAutorizado?: boolean;
};

async function enviarAutenticado<T>(
  url: string,
  init: RequestInit,
  opcoes: OpcoesAutenticado = {},
): Promise<T> {
  try {
    return await enviar<T>(url, init);
  } catch (erro) {
    if (erro instanceof ApiError && erro.code === "UNAUTHORIZED" && opcoes.sairSeNaoAutorizado !== false) {
      sessaoRecusada();
    }
    throw erro;
  }
}

export function getAutenticado<T>(url: string): Promise<T> {
  return enviarAutenticado<T>(url, { headers: cabecalhoAutenticado() });
}

export function putAutenticado<T>(url: string, corpo: unknown): Promise<T> {
  return enviarAutenticado<T>(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...cabecalhoAutenticado() },
    body: JSON.stringify(corpo),
  });
}

export function postAutenticado<T>(
  url: string,
  corpo: unknown = {},
  opcoes?: OpcoesAutenticado,
): Promise<T> {
  return enviarAutenticado<T>(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cabecalhoAutenticado() },
      body: JSON.stringify(corpo),
    },
    opcoes,
  );
}
