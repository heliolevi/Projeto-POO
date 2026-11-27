import { randomUUID } from "node:crypto";
import { exigirPerfil, exigirSessao } from "@/modules/contas";
import { exigirDentroDoLimite } from "@/shared/db/limite-tentativas";
import { query } from "@/shared/db/pool";
import { lerTextoLimitado } from "@/shared/http/corpo";
import { UnauthorizedError } from "@/shared/http/errors";
import { lerJson } from "@/shared/http/json";
import { created, errorResponse, ok } from "@/shared/http/response";
import {
  criarConsultarStatus,
  criarIniciarPagamento,
  criarProcessarAviso,
  type DependenciasPagarReserva,
} from "../application/pagar-reserva";
import { AssinaturaInvalida, gatewayStripe, lerAvisoDaStripe } from "../infrastructure/gateway-stripe";
import { gerarQrCodeBase64 } from "../infrastructure/qr-code";
import { clienteDoPagamento, emTransacao } from "../infrastructure/repositorio-pagamentos";

// 10 cobranças por hora por usuário (contrato, rota 16).
const LIMITE_PAGAMENTOS_POR_USUARIO = { max: 10, janelaSegundos: 60 * 60 };

// Os avisos da Stripe são pequenos; 64 KiB dá folga sem abrir espaço para abuso.
const LIMITE_CORPO_WEBHOOK_BYTES = 64 * 1024;

const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

const deps: DependenciasPagarReserva = {
  transacao: emTransacao,
  agora: () => new Date(),
  gerarId: randomUUID,
  gerarQrCode: gerarQrCodeBase64,
  gateway: () => gatewayStripe,
  clienteDoPagamento,
  registrarErro: (erro) => console.error("[pagamentos] consulta à Stripe falhou:", erro),
};

const iniciarPagamento = criarIniciarPagamento(deps);
const consultarStatus = criarConsultarStatus(deps);
const processarAviso = criarProcessarAviso(deps);

// As rotas 16 e 17 são do CLIENTE dono da reserva: 401 sem sessão válida, 403 para a equipe.
async function sessaoDoCliente(request: Request) {
  return exigirPerfil(await exigirSessao(request), "CLIENTE");
}

// POST /api/pagamentos (rota 16): 201 com a cobrança nova, 200 se reaproveitou o Pix pendente.
export async function postPagamentos(request: Request) {
  try {
    const sessao = await sessaoDoCliente(request);
    await exigirDentroDoLimite(query, `pagamentos:usuario:${sessao.usuarioId}`, LIMITE_PAGAMENTOS_POR_USUARIO);
    const { cobranca, criada } = await iniciarPagamento(sessao, await lerJson(request));
    return criada ? created(cobranca, SEM_CACHE) : ok(cobranca, SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

// GET /api/pagamentos/{reservaId}/status (rota 17). Sem limite de tentativas: a tela consulta a
// cada 3 segundos enquanto o Pix está aberto.
export async function getStatusDoPagamento(request: Request, reservaId: string) {
  try {
    const sessao = await sessaoDoCliente(request);
    return ok(await consultarStatus(sessao, reservaId), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

// POST /api/pagamentos/webhook (rota 18): aviso da Stripe. Sem token de usuário; a autenticação é a
// assinatura (stripe-signature). Responde 200 também para eventos que não interessam.
export async function postWebhookDePagamento(request: Request) {
  try {
    const corpo = await lerTextoLimitado(request, LIMITE_CORPO_WEBHOOK_BYTES);
    let aviso;
    try {
      aviso = lerAvisoDaStripe(corpo, request.headers.get("stripe-signature"));
    } catch (erro) {
      if (erro instanceof AssinaturaInvalida) throw new UnauthorizedError(erro.message);
      throw erro;
    }
    const resultado = aviso ? await processarAviso(aviso.idExterno, aviso.situacao) : "ignorado";
    return ok({ recebido: true, resultado }, SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}
