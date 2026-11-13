import { ConflictError } from "../../../shared/http/errors.ts";

// Mesmos valores dos enums do banco (canal_notificacao, tipo_notificacao, status_notificacao).
export const CANAIS_DE_NOTIFICACAO = ["WEB_PUSH", "WHATSAPP", "EMAIL"] as const;
export type CanalDeNotificacao = (typeof CANAIS_DE_NOTIFICACAO)[number];

export const TIPOS_DE_NOTIFICACAO = [
  "RESERVA_CONFIRMADA",
  "LEMBRETE_RETIRADA",
  "LEMBRETE_DEVOLUCAO",
  "PAGAMENTO_APROVADO",
  "OCORRENCIA_ABERTA",
] as const;
export type TipoDeNotificacao = (typeof TIPOS_DE_NOTIFICACAO)[number];

export const STATUS_DE_NOTIFICACAO = ["AGENDADA", "ENVIADA", "FALHA", "LIDA"] as const;
export type StatusDeNotificacao = (typeof STATUS_DE_NOTIFICACAO)[number];

// 409: a notificação não está num estado que permita a operação pedida.
export class NotificacaoInvalida extends ConflictError {}

// O que o canal de envio recebe: só o necessário para entregar a mensagem.
export type MensagemParaEnvio = {
  usuarioId: string;
  canal: CanalDeNotificacao;
  tipo: TipoDeNotificacao;
  titulo: string;
  mensagem: string;
};

// Contrato de quem entrega uma mensagem (web push, WhatsApp, e-mail). Cada canal é uma implementação
// diferente; a Notificacao só conhece este contrato (polimorfismo).
export interface EnviadorDeNotificacao {
  enviar(mensagem: MensagemParaEnvio): Promise<void>;
}

export type DadosNotificacao = {
  id: string;
  usuarioId: string;
  canal: CanalDeNotificacao;
  tipo: TipoDeNotificacao;
  titulo: string;
  mensagem: string;
  agendadaPara: Date;
  status?: StatusDeNotificacao;
  enviadaEm?: Date | null;
  lidaEm?: Date | null;
  tentativas?: number;
};

// Um aviso para um usuário, por um canal. Nasce AGENDADA; passa a ENVIADA quando o canal entrega, a
// FALHA quando o canal falha (e pode ser reenviada) e a LIDA quando o usuário a abre.
//
// Encapsulamento: o status só muda por enviar() e marcarComoLida().
export class Notificacao {
  readonly #id: string;
  readonly #usuarioId: string;
  readonly #canal: CanalDeNotificacao;
  readonly #tipo: TipoDeNotificacao;
  readonly #titulo: string;
  readonly #mensagem: string;
  readonly #agendadaPara: Date;
  #status: StatusDeNotificacao;
  #enviadaEm: Date | null;
  #lidaEm: Date | null;
  #tentativas: number;

  constructor(dados: DadosNotificacao) {
    if (!dados.id) throw new RangeError("A notificação precisa de um id.");
    if (!dados.usuarioId) throw new RangeError("A notificação precisa de um destinatário.");
    if (!CANAIS_DE_NOTIFICACAO.includes(dados.canal)) throw new RangeError("Canal de notificação inválido.");
    if (!TIPOS_DE_NOTIFICACAO.includes(dados.tipo)) throw new RangeError("Tipo de notificação inválido.");
    if (dados.titulo.trim().length === 0) throw new RangeError("A notificação precisa de um título.");
    if (dados.mensagem.trim().length === 0) throw new RangeError("A notificação precisa de uma mensagem.");
    if (Number.isNaN(dados.agendadaPara.getTime())) throw new RangeError("Data de agendamento inválida.");
    this.#id = dados.id;
    this.#usuarioId = dados.usuarioId;
    this.#canal = dados.canal;
    this.#tipo = dados.tipo;
    this.#titulo = dados.titulo.trim();
    this.#mensagem = dados.mensagem.trim();
    this.#agendadaPara = new Date(dados.agendadaPara);
    this.#status = dados.status ?? "AGENDADA";
    this.#enviadaEm = dados.enviadaEm ? new Date(dados.enviadaEm) : null;
    this.#lidaEm = dados.lidaEm ? new Date(dados.lidaEm) : null;
    this.#tentativas = dados.tentativas ?? 0;
  }

  get id(): string {
    return this.#id;
  }
  get usuarioId(): string {
    return this.#usuarioId;
  }
  get canal(): CanalDeNotificacao {
    return this.#canal;
  }
  get tipo(): TipoDeNotificacao {
    return this.#tipo;
  }
  get titulo(): string {
    return this.#titulo;
  }
  get mensagem(): string {
    return this.#mensagem;
  }
  get status(): StatusDeNotificacao {
    return this.#status;
  }
  get tentativas(): number {
    return this.#tentativas;
  }
  get agendadaPara(): Date {
    return new Date(this.#agendadaPara);
  }
  get enviadaEm(): Date | null {
    return this.#enviadaEm === null ? null : new Date(this.#enviadaEm);
  }
  get lidaEm(): Date | null {
    return this.#lidaEm === null ? null : new Date(this.#lidaEm);
  }

  // Já está na hora (ou passou) de enviar.
  estaNaHora(agora: Date): boolean {
    return agora.getTime() >= this.#agendadaPara.getTime();
  }

  // Entrega pelo canal. Devolve true se entregou e false se o canal falhou (a notificação fica em
  // FALHA, com a tentativa contada, e pode ser reenviada). Só se envia o que está AGENDADA ou em
  // FALHA, e só a partir da hora marcada. O erro do canal não sobe: quem varre as pendentes
  // continua com as outras, e o detalhe técnico não vaza para o usuário.
  async enviar(enviador: EnviadorDeNotificacao, agora: Date): Promise<boolean> {
    if (this.#status !== "AGENDADA" && this.#status !== "FALHA") {
      throw new NotificacaoInvalida(`Não é possível enviar: a notificação está ${this.#status}.`);
    }
    if (!this.estaNaHora(agora)) {
      throw new NotificacaoInvalida("Ainda não é a hora de enviar esta notificação.");
    }
    this.#tentativas += 1;
    try {
      await enviador.enviar({
        usuarioId: this.#usuarioId,
        canal: this.#canal,
        tipo: this.#tipo,
        titulo: this.#titulo,
        mensagem: this.#mensagem,
      });
    } catch {
      this.#status = "FALHA";
      return false;
    }
    this.#status = "ENVIADA";
    this.#enviadaEm = new Date(agora);
    return true;
  }

  // O usuário abriu o aviso. Idempotente; só se lê o que já foi enviado.
  marcarComoLida(agora: Date): void {
    if (this.#status === "LIDA") return;
    if (this.#status !== "ENVIADA") {
      throw new NotificacaoInvalida(`Não é possível marcar como lida: a notificação está ${this.#status}.`);
    }
    this.#status = "LIDA";
    this.#lidaEm = new Date(agora);
  }
}
