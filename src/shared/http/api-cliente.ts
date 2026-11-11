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

export async function postJson<T>(url: string, corpo: unknown): Promise<T> {
  const resposta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });

  const json = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    const erro = json?.error ?? { code: "UNKNOWN", message: "Não foi possível completar a ação." };
    throw new ApiError(erro.code, erro.message, erro.details);
  }

  return json.data as T;
}
