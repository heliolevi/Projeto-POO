import { createHmac, timingSafeEqual } from "node:crypto";
import { Ambiente } from "../../../shared/config/ambiente.ts";
import { REGRA_DO_SEGREDO_DE_SESSAO } from "../../../shared/config/validador-do-ambiente.ts";
import type { PerfilUsuario } from "../domain/usuario.ts";

export const DURACAO_SESSAO_SEGUNDOS = 60 * 60 * 24;

export type SessaoToken = { sub: string; perfil: PerfilUsuario; iat: number; exp: number };

const b64 = (dados: string | Buffer) => Buffer.from(dados).toString("base64url");

// Token de sessão: JWT HS256 assinado com SESSION_SECRET. Sem estado no banco, então o
// token em si não pode ser revogado antes de expirar. Por isso as rotas protegidas usam
// SessaoDaRequisicao, que confere no banco se a conta continua ativa. O ambiente (de onde vem o
// segredo) e o relógio entram pelo construtor; o segredo é lido a cada uso, então trocá-lo vale na hora.
export class ServicoDeToken {
  /** O do app: lê o SESSION_SECRET do process.env e usa o relógio de verdade. */
  static readonly padrao = new ServicoDeToken();

  readonly #ambiente: Ambiente;
  readonly #agoraEmSegundos: () => number;

  constructor(opcoes: { ambiente?: Ambiente; agoraEmSegundos?: () => number } = {}) {
    this.#ambiente = opcoes.ambiente ?? Ambiente.padrao;
    this.#agoraEmSegundos = opcoes.agoraEmSegundos ?? (() => Date.now() / 1000);
  }

  #segredo(): string {
    // O validador do ambiente confere o valor sem os espaços das pontas; aqui vale o mesmo valor, para a
    // checagem da subida e a assinatura do token nunca discordarem.
    const valor = this.#ambiente.exigir("SESSION_SECRET").trim();
    const problema = REGRA_DO_SEGREDO_DE_SESSAO.conferir(valor, true);
    if (problema) throw new Error(problema);
    return valor;
  }

  #assinar(conteudo: string): Buffer {
    return createHmac("sha256", this.#segredo()).update(conteudo).digest();
  }

  emitir(usuario: { id: string; perfil: PerfilUsuario }): { token: string; expiraEm: Date } {
    const iat = Math.floor(this.#agoraEmSegundos());
    const exp = iat + DURACAO_SESSAO_SEGUNDOS;
    const cabecalho = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const corpo = b64(JSON.stringify({ sub: usuario.id, perfil: usuario.perfil, iat, exp }));
    const conteudo = `${cabecalho}.${corpo}`;
    return { token: `${conteudo}.${b64(this.#assinar(conteudo))}`, expiraEm: new Date(exp * 1000) };
  }

  /** Os dados do token, ou null se ele for malformado, de assinatura errada, sem `exp` ou vencido. */
  verificar(token: string): SessaoToken | null {
    const partes = token.split(".");
    if (partes.length !== 3) return null;
    const [cabecalho, corpo, assinatura] = partes;
    const esperada = this.#assinar(`${cabecalho}.${corpo}`);
    const recebida = Buffer.from(assinatura, "base64url");
    if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) return null;
    try {
      const cab = JSON.parse(Buffer.from(cabecalho, "base64url").toString());
      if (cab.alg !== "HS256") return null;
      const sessao = JSON.parse(Buffer.from(corpo, "base64url").toString()) as SessaoToken;
      if (typeof sessao.sub !== "string") return null;
      // Sem 'exp' o token não expiraria nunca; exigir o campo evita aceitar token sem prazo.
      if (typeof sessao.exp !== "number" || sessao.exp <= this.#agoraEmSegundos()) return null;
      return sessao;
    } catch {
      return null;
    }
  }
}
