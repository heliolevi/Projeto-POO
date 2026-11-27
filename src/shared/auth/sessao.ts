export type PerfilUsuario = "CLIENTE" | "OPERADOR" | "ADMIN";

const PERFIS_VALIDOS: readonly PerfilUsuario[] = ["CLIENTE", "OPERADOR", "ADMIN"];

// A sessão de quem está logado, lida do payload do token. Só serve para montar a UI (ex.: qual
// menu mostrar): a API sempre confere o token de verdade (assinatura e conta ativa) a cada
// chamada, então não ter a chave secreta aqui não é um problema de segurança.
export class Sessao {
  readonly #usuarioId: string;
  readonly #perfil: PerfilUsuario;
  readonly #exp: number;

  private constructor(usuarioId: string, perfil: PerfilUsuario, exp: number) {
    this.#usuarioId = usuarioId;
    this.#perfil = perfil;
    this.#exp = exp;
  }

  /** Lê o token. Devolve null se ele estiver ausente, malformado, de perfil desconhecido ou expirado. */
  static decodificar(token: string | null, agoraMs: number = Date.now()): Sessao | null {
    if (!token) return null;

    const partes = token.split(".");
    if (partes.length !== 3) return null;
    try {
      const corpo = JSON.parse(atob(partes[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (typeof corpo.sub !== "string" || typeof corpo.perfil !== "string") return null;
      if (!PERFIS_VALIDOS.includes(corpo.perfil as PerfilUsuario)) return null;
      if (typeof corpo.exp !== "number" || corpo.exp <= agoraMs / 1000) return null;
      return new Sessao(corpo.sub, corpo.perfil as PerfilUsuario, corpo.exp);
    } catch {
      return null;
    }
  }

  get usuarioId(): string {
    return this.#usuarioId;
  }

  get perfil(): PerfilUsuario {
    return this.#perfil;
  }

  /** Quando o token expira, em segundos desde 1970. */
  get exp(): number {
    return this.#exp;
  }

  toJSON(): { usuarioId: string; perfil: PerfilUsuario; exp: number } {
    return { usuarioId: this.#usuarioId, perfil: this.#perfil, exp: this.#exp };
  }
}

/** O que o armazém precisa da janela do navegador (nos testes entra uma de mentira). */
export type JanelaDoNavegador = {
  localStorage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  addEventListener?: Window["addEventListener"];
  removeEventListener?: Window["removeEventListener"];
  dispatchEvent?: Window["dispatchEvent"];
};

// Guarda o token da sessão no navegador (localStorage) e avisa a tela quando ele muda. A janela é
// buscada a cada uso, então no servidor (sem window) o armazém simplesmente está vazio.
export class ArmazemDeSessao {
  static readonly CHAVE_TOKEN = "bik_token";
  static readonly EVENTO = "bik:sessao";

  /** O armazém do app: usa o window de verdade, quando existe. */
  static readonly navegador = new ArmazemDeSessao(() =>
    typeof window === "undefined" ? null : (window as unknown as JanelaDoNavegador),
  );

  readonly #janela: () => JanelaDoNavegador | null;

  constructor(janela: () => JanelaDoNavegador | null) {
    this.#janela = janela;
  }

  token(): string | null {
    return this.#janela()?.localStorage.getItem(ArmazemDeSessao.CHAVE_TOKEN) ?? null;
  }

  sessao(): Sessao | null {
    return Sessao.decodificar(this.token());
  }

  salvar(token: string): void {
    const janela = this.#janela();
    if (!janela) return;
    // MVP: ver ticket de hardening
    janela.localStorage.setItem(ArmazemDeSessao.CHAVE_TOKEN, token);
    this.#avisarMudanca(janela);
  }

  limpar(): void {
    const janela = this.#janela();
    if (!janela) return;
    janela.localStorage.removeItem(ArmazemDeSessao.CHAVE_TOKEN);
    this.#avisarMudanca(janela);
  }

  // Para quem precisa reagir a login/logout (mesma aba pelo evento, outras abas pelo "storage").
  // Devolve a função que cancela a assinatura.
  assinar(aoMudar: () => void): () => void {
    const janela = this.#janela();
    if (!janela?.addEventListener) return () => {};
    janela.addEventListener(ArmazemDeSessao.EVENTO, aoMudar);
    janela.addEventListener("storage", aoMudar);
    return () => {
      janela.removeEventListener?.(ArmazemDeSessao.EVENTO, aoMudar);
      janela.removeEventListener?.("storage", aoMudar);
    };
  }

  #avisarMudanca(janela: JanelaDoNavegador): void {
    janela.dispatchEvent?.(new Event(ArmazemDeSessao.EVENTO));
  }
}
