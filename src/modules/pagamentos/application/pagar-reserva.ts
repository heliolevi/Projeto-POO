import { Uuid } from "../../../shared/dominio/uuid.ts";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/http/errors.ts";
import { PagamentoPix, type CobrancaPix } from "../domain/formas-de-pagamento.ts";
import type { Pagamento, StatusPagamento } from "../domain/pagamento.ts";
import { IntervaloDeConsulta } from "./intervalo-de-consulta.ts";
import { PagamentoService, type ReservaParaPagar } from "./pagamento-service.ts";
import type {
  GatewayPix,
  OperacoesPagamento,
  SessaoCliente,
  SituacaoNoGateway,
  TransacaoPagamento,
} from "./portas.ts";

// Casos de uso das rotas 16, 17 e 18 (docs/contrato-api-mvp.md), com a Stripe como meio de
// pagamento. As regras do pagamento (um pendente por reserva, idempotência, prazo do Pix, ciclo de
// vida) são da classe Pagamento e do PagamentoService; aqui ficam a validação do corpo, as
// transações, a conversa com a Stripe e a ponte com a reserva (travar, expirar as vencidas, confirmar).
//
// Duas regras de concorrência valem para todo caminho:
// 1. A ordem das travas é sempre RESERVA, depois PAGAMENTO, a mesma de expirar_reservas_vencidas()
//    (migration 0008). Ordem invertida entre o aviso da Stripe e a consulta de status dava deadlock.
// 2. A consulta à Stripe da rota 17 acontece FORA da transação: a conexão do banco não fica presa
//    esperando a rede (o pool do app é pequeno).

// Cobrança da rota 16: o que o domínio gera mais a imagem do QR code (PNG em base64).
export type CobrancaPixComQrCode = Omit<CobrancaPix, "pix"> & {
  pix: CobrancaPix["pix"] & { qrCodeBase64: string };
};

// Resposta da rota 17.
export type StatusDoPagamento = {
  reservaId: string;
  statusPagamento: StatusPagamento | null;
  statusReserva: string;
};

// O que aconteceu com um aviso da Stripe (rota 18 ou a consulta da rota 17).
export type ResultadoDoAviso = "confirmado" | "estornado" | "atualizado" | "ignorado";

export type DependenciasPagarReserva = {
  transacao: TransacaoPagamento;
  agora: () => Date;
  gerarId: () => string;
  // imagem PNG do QR code, em base64 (sem o prefixo data:)
  gerarQrCode: (texto: string) => Promise<string>;
  // o meio de pagamento; lança PagamentoIndisponivelError (502) se não estiver configurado
  gateway: () => GatewayPix;
  // de quem é o pagamento ligado a esta cobrança (o aviso da Stripe chega sem sessão)
  clienteDoPagamento: (idExterno: string) => Promise<string | null>;
  // erros que não devem derrubar a consulta de status (a Stripe fora do ar, por exemplo)
  registrarErro?: (erro: unknown) => void;
  // limite de cobranças NOVAS por cliente (contrato, rota 16: 10 por hora). Só conta quando uma
  // cobrança vai mesmo ser criada; reabrir a tela e reaproveitar o Pix pendente não conta. Roda
  // fora de qualquer transação (usa a sua própria conexão).
  limitarCriacao?: (sessao: SessaoCliente) => Promise<void>;
  // de quanto em quanto tempo a rota 17 pode perguntar à Stripe sobre a mesma cobrança
  intervaloDeConsulta?: IntervaloDeConsulta;
};

export class PagarReservaService {
  static readonly MENSAGEM_RESERVA_NAO_ENCONTRADA = "Reserva não encontrada.";
  static readonly MENSAGEM_PRAZO_TERMINANDO =
    "O prazo para pagar esta reserva está terminando. Faça uma nova reserva para pagar com calma.";
  static readonly MENSAGEM_RESERVA_NAO_ACEITA_PAGAMENTO =
    "Esta reserva não aceita mais pagamento: ela não está pendente de pagamento.";

  /** A Stripe só aceita Pix que vença pelo menos 60 segundos depois da criação. */
  static readonly VALIDADE_MINIMA_DO_PIX_MS = 60 * 1000;

  /** A rota 17 pergunta à Stripe sobre a mesma cobrança no máximo a cada 6 s (a tela consulta a cada 3 s). */
  static readonly INTERVALO_DE_CONSULTA_MS = 6 * 1000;

  readonly #deps: DependenciasPagarReserva;
  readonly #intervalo: IntervaloDeConsulta;

  constructor(deps: DependenciasPagarReserva) {
    this.#deps = deps;
    this.#intervalo = deps.intervaloDeConsulta ?? new IntervaloDeConsulta(PagarReservaService.INTERVALO_DE_CONSULTA_MS);
  }

  /**
   * POST /api/pagamentos (rota 16). Devolve a cobrança e se ela foi criada agora (201) ou é o Pix
   * pendente que já existia (200).
   */
  async iniciar(sessao: SessaoCliente, corpo: unknown): Promise<{ cobranca: CobrancaPixComQrCode; criada: boolean }> {
    const { reservaId } = PagarReservaService.#validarCorpo(corpo);

    // O limite de cobranças só conta quando uma cobrança nova vai ser criada: reabrir a tela e
    // reaproveitar o Pix pendente não conta. Ele é conferido ANTES da transação principal, numa
    // leitura curta: dentro dela, o limite pediria uma segunda conexão ao pool enquanto a reserva
    // está travada, e com vários pedidos ao mesmo tempo o pool se esgotava.
    if (this.#deps.limitarCriacao) {
      const pendente = await this.#deps.transacao(sessao, (op) => op.buscarPendenteDaReserva(reservaId));
      if (!pendente || pendente.estaVencido(this.#deps.agora())) await this.#deps.limitarCriacao(sessao);
    }

    // A cobrança nova nasce na Stripe com a reserva travada (duas chamadas ao mesmo tempo não criam
    // dois Pix). Se a transação falhar depois disso, o Pix criado é cancelado na Stripe: ele nunca
    // chegou à tela, mas não pode ficar vivo sem linha no banco.
    const naStripe: { idExterno: string | null } = { idExterno: null };

    let resultado: { gerada: CobrancaPix; criada: boolean };
    try {
      resultado = await this.#deps.transacao(sessao, async (op) => {
        await op.expirarVencidas();
        const reserva = await op.travarReserva(reservaId);
        if (!reserva) throw new NotFoundError(PagarReservaService.MENSAGEM_RESERVA_NAO_ENCONTRADA);

        const registrarCobranca = async (pagamento: Pagamento) => {
          if (!(pagamento instanceof PagamentoPix)) throw new Error("Só o Pix tem cobrança nesta rota.");
          if (pagamento.expiraEm().getTime() - this.#deps.agora().getTime() < PagarReservaService.VALIDADE_MINIMA_DO_PIX_MS) {
            throw new ConflictError(PagarReservaService.MENSAGEM_PRAZO_TERMINANDO);
          }
          const pagador = await op.pagador();
          if (!pagador) throw new NotFoundError(PagarReservaService.MENSAGEM_RESERVA_NAO_ENCONTRADA);
          const { idExterno, copiaECola } = await this.#deps.gateway().criarCobrancaPix({
            pagamentoId: pagamento.id,
            reservaId: pagamento.reservaId,
            valorCentavos: pagamento.valor.centavos,
            expiraEm: pagamento.expiraEm(),
            pagador,
          });
          naStripe.idExterno = idExterno;
          pagamento.registrarCobranca(idExterno, copiaECola);
        };

        // o serviço só pede um id novo quando cria a cobrança; se devolveu outro id, reaproveitou o
        // Pix pendente que já existia
        const novo: { id: string | null } = { id: null };
        const gerarId = () => (novo.id = this.#deps.gerarId());
        const gerada = await this.#servicoNaTransacao(op, { gerarId, registrarCobranca }).iniciarPagamento(
          reserva,
          "PIX",
        );
        return { gerada: gerada as CobrancaPix, criada: novo.id === gerada.pagamentoId };
      });
    } catch (erro) {
      if (naStripe.idExterno) {
        await this.#deps
          .gateway()
          .cancelar(naStripe.idExterno)
          .catch((falha) => this.#deps.registrarErro?.(falha));
      }
      throw erro;
    }

    const qrCodeBase64 = await this.#deps.gerarQrCode(resultado.gerada.pix.copiaECola);
    return {
      cobranca: { ...resultado.gerada, pix: { ...resultado.gerada.pix, qrCodeBase64 } },
      criada: resultado.criada,
    };
  }

  /**
   * GET /api/pagamentos/{reservaId}/status (rota 17). A tela chama a cada 3 segundos. Se há um Pix
   * pendente, pergunta à Stripe como ele está ANTES de expirar as vencidas: um Pix pago no último
   * segundo confirma a reserva em vez de ela expirar. Assim a tela funciona mesmo quando o aviso da
   * Stripe (rota 18) não chega, como no ambiente local. Se a Stripe não responder, ou se aplicar a
   * resposta falhar (um estorno recusado, por exemplo), devolve o que o banco sabe e a próxima
   * consulta tenta de novo.
   */
  async consultarStatus(sessao: SessaoCliente, reservaId: unknown): Promise<StatusDoPagamento> {
    if (!Uuid.ehValido(reservaId)) throw new NotFoundError(PagarReservaService.MENSAGEM_RESERVA_NAO_ENCONTRADA);

    const pendente = await this.#deps.transacao(sessao, (op) => op.buscarPendenteDaReserva(reservaId));
    const idExterno = pendente?.mpPaymentId ?? null;
    if (idExterno && this.#intervalo.podeConsultar(idExterno, this.#deps.agora())) {
      let situacao: SituacaoNoGateway | null = null;
      try {
        // fora da transação: a conexão do banco não espera a rede
        situacao = await this.#deps.gateway().consultar(idExterno);
      } catch (erro) {
        this.#deps.registrarErro?.(erro);
      }
      if (situacao && situacao !== "pendente") {
        const respostaDaStripe = situacao;
        try {
          await this.#deps.transacao(sessao, (op) => this.#aplicarComTravas(op, idExterno, respostaDaStripe));
        } catch (erro) {
          this.#deps.registrarErro?.(erro);
        }
      }
    }

    return this.#deps.transacao(sessao, async (op) => {
      await op.expirarVencidas();
      return PagarReservaService.#lerSituacao(op, reservaId);
    });
  }

  /**
   * POST /api/pagamentos/webhook (rota 18), já com a assinatura conferida pela infraestrutura. O aviso
   * chega sem sessão: descobre-se o cliente dono do pagamento e a mudança roda com a sessão dele,
   * passando pelas mesmas políticas de RLS das outras rotas. Cobrança desconhecida é ignorada (200),
   * para a Stripe não ficar reenviando.
   */
  async processarAviso(idExterno: string, situacao: SituacaoNoGateway): Promise<ResultadoDoAviso> {
    if (situacao === "pendente") return "ignorado";
    const clienteId = await this.#deps.clienteDoPagamento(idExterno);
    if (!clienteId) return "ignorado";
    const sessao: SessaoCliente = { perfil: "CLIENTE", usuarioId: clienteId };
    return this.#deps.transacao(sessao, (op) => this.#aplicarComTravas(op, idExterno, situacao));
  }

  // Corpo da rota 16: { "reservaId": "uuid", "metodo": "PIX" }. Por enquanto só PIX. Um id que não é UUID
  // não chega ao banco (daria erro 22P02 e um 500): para a API é só uma reserva que não existe.
  static #validarCorpo(corpo: unknown): { reservaId: string } {
    const objeto = typeof corpo === "object" && corpo !== null && !Array.isArray(corpo) ? corpo : null;
    if (!objeto) throw new ValidationError("O corpo precisa ser um objeto JSON.");
    const { reservaId, metodo } = objeto as { reservaId?: unknown; metodo?: unknown };
    const erros: Record<string, string> = {};
    if (!Uuid.ehValido(reservaId)) erros.reservaId = "Informe o id (UUID) da reserva.";
    if (metodo !== "PIX") erros.metodo = "Forma de pagamento inválida. Por enquanto só há PIX.";
    if (Object.keys(erros).length > 0) throw new ValidationError("Dados inválidos.", erros);
    return { reservaId: reservaId as string };
  }

  static async #lerSituacao(op: OperacoesPagamento, reservaId: string): Promise<StatusDoPagamento> {
    const situacao = await op.situacao(reservaId);
    if (!situacao) throw new NotFoundError(PagarReservaService.MENSAGEM_RESERVA_NAO_ENCONTRADA);
    return { reservaId, statusPagamento: situacao.statusPagamento, statusReserva: situacao.statusReserva };
  }

  // Trava a reserva e depois o pagamento (a ordem da regra 1) e aplica o que a Stripe disse.
  async #aplicarComTravas(
    op: OperacoesPagamento,
    idExterno: string,
    situacao: SituacaoNoGateway,
  ): Promise<ResultadoDoAviso> {
    const semTrava = await op.buscarPorIdExterno(idExterno);
    if (!semTrava) return "ignorado";
    const reserva = await op.travarReserva(semTrava.reservaId);
    const pagamento = await op.travarPorIdExterno(idExterno);
    if (!pagamento) return "ignorado";
    return this.#aplicarSituacao(op, pagamento, reserva, situacao);
  }

  // Aplica ao pagamento (já travado, com a reserva travada antes) o que a Stripe diz da cobrança:
  // - aprovado e a reserva ainda pendente: pagamento APROVADO e reserva CONFIRMADA;
  // - aprovado mas a reserva já caiu (expirou ou foi cancelada enquanto o Pix estava aberto): o
  //   dinheiro entrou sem bicicleta garantida, então é estornado na hora, inteiro, e o pagamento
  //   fica ESTORNADO. Vale também quando o banco já tinha expirado o pagamento (o Pix pago no último
  //   segundo, com o aviso chegando depois de expirar_reservas_vencidas());
  // - recusado ou expirado: o pagamento pendente acompanha.
  // Idempotente: o mesmo aviso de novo não muda nada.
  async #aplicarSituacao(
    op: OperacoesPagamento,
    pagamento: Pagamento,
    reserva: ReservaParaPagar | null,
    situacao: SituacaoNoGateway,
  ): Promise<ResultadoDoAviso> {
    const idExterno = pagamento.mpPaymentId;
    if (situacao === "pendente" || idExterno === null) return "ignorado";

    if (situacao === "recusado" || situacao === "expirado") {
      if (pagamento.status !== "PENDENTE") return "ignorado";
      if (situacao === "recusado") pagamento.recusar();
      else pagamento.expirar();
      await op.salvar(pagamento);
      return "atualizado";
    }

    // aprovado
    if (pagamento.status === "APROVADO" || pagamento.status === "ESTORNADO") return "ignorado";
    const reservaAberta =
      pagamento.status === "PENDENTE" &&
      reserva?.status === "PENDENTE_PAGAMENTO" &&
      (reserva.expiraEm === null || this.#deps.agora().getTime() < reserva.expiraEm.getTime());

    if (reservaAberta) {
      try {
        await this.#servicoNaTransacao(op).processarWebhook({
          pagamentoId: pagamento.id,
          mpPaymentId: idExterno,
          situacao: "aprovado",
        });
        return "confirmado";
      } catch (erro) {
        // a reserva caiu entre a conferência e a confirmação: segue para o estorno
        if (!(erro instanceof ConflictError)) throw erro;
      }
    }

    // Pago sem reserva: devolve o dinheiro. O estorno na Stripe vem antes de gravar: se ele falhar, a
    // transação desfaz e o próximo aviso (a Stripe reenvia) tenta de novo; a chave de idempotência
    // do estorno impede devolver duas vezes.
    await this.#deps.gateway().estornar(idExterno);
    // (o status é relido a cada passo: a tentativa de confirmar acima pode tê-lo mudado em memória)
    if ((pagamento.status as StatusPagamento) === "PENDENTE") pagamento.confirmar(idExterno, this.#deps.agora());
    if ((pagamento.status as StatusPagamento) === "APROVADO") pagamento.estornarTudo();
    else pagamento.estornarPagamentoTardio(); // EXPIRADO ou RECUSADO aqui, pago na Stripe
    await op.salvar(pagamento);
    return "estornado";
  }

  // O serviço de domínio montado sobre as operações desta transação: a aprovação confirma a reserva
  // na mesma transação em que o pagamento é gravado.
  #servicoNaTransacao(
    op: OperacoesPagamento,
    extras: { gerarId?: () => string; registrarCobranca?: (p: Pagamento) => Promise<void> } = {},
  ): PagamentoService {
    return new PagamentoService({
      repositorio: op,
      agora: this.#deps.agora,
      gerarId: extras.gerarId ?? this.#deps.gerarId,
      registrarCobranca:
        extras.registrarCobranca ??
        (async () => {
          throw new Error("Cobrança nova só nasce na rota 16.");
        }),
      aoAprovar: async (reservaId) => {
        if (!(await op.confirmarReserva(reservaId))) {
          throw new ConflictError(PagarReservaService.MENSAGEM_RESERVA_NAO_ACEITA_PAGAMENTO);
        }
      },
    });
  }
}
