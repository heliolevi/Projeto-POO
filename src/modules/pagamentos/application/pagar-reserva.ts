import { ConflictError, NotFoundError, ValidationError } from "../../../shared/http/errors.ts";
import { PagamentoPix, type CobrancaPix } from "../domain/formas-de-pagamento.ts";
import type { Pagamento, StatusPagamento } from "../domain/pagamento.ts";
import { PagamentoService } from "./pagamento-service.ts";
import type {
  GatewayPix,
  OperacoesPagamento,
  SessaoCliente,
  SituacaoNoGateway,
  TransacaoPagamento,
} from "./portas.ts";

// Casos de uso das rotas 16, 17 e 18 (docs/contrato-api-mvp.md), com a Stripe como meio de
// pagamento. As regras do pagamento (um pendente por reserva, idempotência, prazo do Pix, ciclo de
// vida) são da classe Pagamento e do PagamentoService; aqui ficam a validação do corpo, a transação,
// a conversa com a Stripe e a ponte com a reserva (travar, expirar as vencidas, confirmar).

export const MENSAGEM_RESERVA_NAO_ENCONTRADA = "Reserva não encontrada.";
export const MENSAGEM_PRAZO_TERMINANDO =
  "O prazo para pagar esta reserva está terminando. Faça uma nova reserva para pagar com calma.";
export const MENSAGEM_RESERVA_NAO_ACEITA_PAGAMENTO =
  "Esta reserva não aceita mais pagamento: ela não está pendente de pagamento.";

// A Stripe só aceita Pix que vença pelo menos 60 segundos depois da criação.
export const VALIDADE_MINIMA_DO_PIX_MS = 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Um id que não é UUID não chega ao banco (daria erro 22P02 e um 500): para a API é só uma reserva
// que não existe.
const ehUuid = (valor: unknown): valor is string => typeof valor === "string" && UUID.test(valor);

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
};

// Corpo da rota 16: { "reservaId": "uuid", "metodo": "PIX" }. Por enquanto só PIX.
function validarCorpo(corpo: unknown): { reservaId: string } {
  const objeto = typeof corpo === "object" && corpo !== null && !Array.isArray(corpo) ? corpo : null;
  if (!objeto) throw new ValidationError("O corpo precisa ser um objeto JSON.");
  const { reservaId, metodo } = objeto as { reservaId?: unknown; metodo?: unknown };
  const erros: Record<string, string> = {};
  if (!ehUuid(reservaId)) erros.reservaId = "Informe o id (UUID) da reserva.";
  if (metodo !== "PIX") erros.metodo = "Forma de pagamento inválida. Por enquanto só há PIX.";
  if (Object.keys(erros).length > 0) throw new ValidationError("Dados inválidos.", erros);
  return { reservaId: reservaId as string };
}

// O serviço de domínio montado sobre as operações desta transação: a aprovação confirma a reserva
// na mesma transação em que o pagamento é gravado.
function servicoNaTransacao(
  op: OperacoesPagamento,
  deps: DependenciasPagarReserva,
  extras: { gerarId?: () => string; registrarCobranca?: (p: Pagamento) => Promise<void> } = {},
) {
  return new PagamentoService({
    repositorio: op,
    agora: deps.agora,
    gerarId: extras.gerarId ?? deps.gerarId,
    registrarCobranca:
      extras.registrarCobranca ??
      (async () => {
        throw new Error("Cobrança nova só nasce na rota 16.");
      }),
    aoAprovar: async (reservaId) => {
      if (!(await op.confirmarReserva(reservaId))) {
        throw new ConflictError(MENSAGEM_RESERVA_NAO_ACEITA_PAGAMENTO);
      }
    },
  });
}

async function lerSituacao(op: OperacoesPagamento, reservaId: string): Promise<StatusDoPagamento> {
  const situacao = await op.situacao(reservaId);
  if (!situacao) throw new NotFoundError(MENSAGEM_RESERVA_NAO_ENCONTRADA);
  return { reservaId, statusPagamento: situacao.statusPagamento, statusReserva: situacao.statusReserva };
}

// Aplica ao pagamento o que a Stripe diz da cobrança. Usado pelo aviso (rota 18) e pela consulta de
// status (rota 17), dentro da transação do cliente dono do pagamento e com o pagamento travado:
// - aprovado e a reserva ainda pendente: pagamento APROVADO e reserva CONFIRMADA;
// - aprovado mas a reserva já caiu (expirou ou foi cancelada enquanto o Pix estava aberto): o
//   dinheiro entrou sem bicicleta garantida, então é estornado na hora, inteiro;
// - recusado ou expirado: o pagamento pendente acompanha.
// Idempotente: o mesmo aviso de novo não muda nada.
export async function aplicarSituacao(
  op: OperacoesPagamento,
  deps: Pick<DependenciasPagarReserva, "agora" | "gerarId" | "gateway">,
  pagamento: Pagamento,
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
  const reserva = await op.travarReserva(pagamento.reservaId);
  const reservaAberta =
    pagamento.status === "PENDENTE" &&
    reserva?.status === "PENDENTE_PAGAMENTO" &&
    (reserva.expiraEm === null || deps.agora().getTime() < reserva.expiraEm.getTime());

  if (reservaAberta) {
    try {
      await servicoNaTransacao(op, deps as DependenciasPagarReserva).processarWebhook({
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
  // transação desfaz e o próximo aviso (a Stripe reenvia) tenta de novo.
  await deps.gateway().estornar(idExterno);
  if (pagamento.status === "PENDENTE") pagamento.confirmar(idExterno, deps.agora());
  // (o status foi relido: confirmar() acabou de mudá-lo)
  if ((pagamento.status as StatusPagamento) === "APROVADO") {
    pagamento.estornarTudo();
    await op.salvar(pagamento);
  }
  return "estornado";
}

// POST /api/pagamentos (rota 16). Devolve a cobrança e se ela foi criada agora (201) ou é o Pix
// pendente que já existia (200).
export function criarIniciarPagamento(deps: DependenciasPagarReserva) {
  return async function iniciarPagamento(
    sessao: SessaoCliente,
    corpo: unknown,
  ): Promise<{ cobranca: CobrancaPixComQrCode; criada: boolean }> {
    const { reservaId } = validarCorpo(corpo);

    const cobranca = await deps.transacao(sessao, async (op) => {
      await op.expirarVencidas();
      const reserva = await op.travarReserva(reservaId);
      if (!reserva) throw new NotFoundError(MENSAGEM_RESERVA_NAO_ENCONTRADA);

      // A cobrança nova é registrada na Stripe dentro da transação, com a reserva travada: duas
      // chamadas ao mesmo tempo não criam dois Pix. Se a Stripe falhar (502), nada é gravado.
      const registrarCobranca = async (pagamento: Pagamento) => {
        if (!(pagamento instanceof PagamentoPix)) throw new Error("Só o Pix tem cobrança nesta rota.");
        if (pagamento.expiraEm().getTime() - deps.agora().getTime() < VALIDADE_MINIMA_DO_PIX_MS) {
          throw new ConflictError(MENSAGEM_PRAZO_TERMINANDO);
        }
        const pagador = await op.pagador();
        if (!pagador) throw new NotFoundError(MENSAGEM_RESERVA_NAO_ENCONTRADA);
        const { idExterno, copiaECola } = await deps.gateway().criarCobrancaPix({
          pagamentoId: pagamento.id,
          reservaId: pagamento.reservaId,
          valorCentavos: pagamento.valor.centavos,
          expiraEm: pagamento.expiraEm(),
          pagador,
        });
        pagamento.registrarCobranca(idExterno, copiaECola);
      };

      // o serviço só pede um id novo quando cria a cobrança; se devolveu outro id, reaproveitou o
      // Pix pendente que já existia
      const novo: { id: string | null } = { id: null };
      const gerarId = () => (novo.id = deps.gerarId());
      const gerada = await servicoNaTransacao(op, deps, { gerarId, registrarCobranca }).iniciarPagamento(
        reserva,
        "PIX",
      );
      return { gerada: gerada as CobrancaPix, criada: novo.id === gerada.pagamentoId };
    });

    const qrCodeBase64 = await deps.gerarQrCode(cobranca.gerada.pix.copiaECola);
    return {
      cobranca: { ...cobranca.gerada, pix: { ...cobranca.gerada.pix, qrCodeBase64 } },
      criada: cobranca.criada,
    };
  };
}

// GET /api/pagamentos/{reservaId}/status (rota 17). A tela chama a cada 3 segundos. Se há um Pix
// pendente, pergunta à Stripe como ele está ANTES de expirar as vencidas: um Pix pago no último
// segundo confirma a reserva em vez de ela expirar. Assim a tela funciona mesmo quando o aviso da
// Stripe (rota 18) não chega, como no ambiente local. Se a Stripe não responder, devolve o que o
// banco sabe (a próxima consulta tenta de novo).
export function criarConsultarStatus(deps: DependenciasPagarReserva) {
  return async function consultarStatus(sessao: SessaoCliente, reservaId: unknown): Promise<StatusDoPagamento> {
    if (!ehUuid(reservaId)) throw new NotFoundError(MENSAGEM_RESERVA_NAO_ENCONTRADA);
    return deps.transacao(sessao, async (op) => {
      const pendente = await op.buscarPendenteDaReserva(reservaId);
      if (pendente?.mpPaymentId) {
        let situacao: SituacaoNoGateway | null = null;
        try {
          situacao = await deps.gateway().consultar(pendente.mpPaymentId);
        } catch (erro) {
          deps.registrarErro?.(erro);
        }
        if (situacao && situacao !== "pendente") {
          const travado = await op.travarPorIdExterno(pendente.mpPaymentId);
          if (travado) await aplicarSituacao(op, deps, travado, situacao);
        }
      }
      await op.expirarVencidas();
      return lerSituacao(op, reservaId);
    });
  };
}

// POST /api/pagamentos/webhook (rota 18), já com a assinatura conferida pela infraestrutura. O aviso
// chega sem sessão: descobre-se o cliente dono do pagamento e a mudança roda com a sessão dele,
// passando pelas mesmas políticas de RLS das outras rotas. Cobrança desconhecida é ignorada (200),
// para a Stripe não ficar reenviando.
export function criarProcessarAviso(deps: DependenciasPagarReserva) {
  return async function processarAviso(idExterno: string, situacao: SituacaoNoGateway): Promise<ResultadoDoAviso> {
    if (situacao === "pendente") return "ignorado";
    const clienteId = await deps.clienteDoPagamento(idExterno);
    if (!clienteId) return "ignorado";
    const sessao: SessaoCliente = { perfil: "CLIENTE", usuarioId: clienteId };
    return deps.transacao(sessao, async (op) => {
      const pagamento = await op.travarPorIdExterno(idExterno);
      if (!pagamento) return "ignorado";
      return aplicarSituacao(op, deps, pagamento, situacao);
    });
  };
}
