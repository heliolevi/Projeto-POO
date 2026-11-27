import { randomUUID } from "node:crypto";
import { PerfisPermitidos, sessoes } from "@/modules/contas";
import { BancoDeDados } from "@/shared/db/banco-de-dados";
import { LimiteDeTentativas } from "@/shared/db/limite-tentativas";
import { UnauthorizedError } from "@/shared/http/errors";
import { LeitorDeCorpo } from "@/shared/http/leitor-de-corpo";
import { Resposta } from "@/shared/http/resposta";
import { PagarReservaService } from "../application/pagar-reserva";
import { AssinaturaInvalida, GatewayStripe, lerAvisoDaStripe } from "../infrastructure/gateway-stripe";
import { gerarQrCodeBase64 } from "../infrastructure/qr-code";
import { clienteDoPagamento, emTransacao } from "../infrastructure/repositorio-pagamentos";

// 10 cobranças por hora por usuário (contrato, rota 16).
const LIMITE_PAGAMENTOS_POR_USUARIO = { max: 10, janelaSegundos: 60 * 60 };

// Os avisos da Stripe são pequenos; 64 KiB dá folga sem abrir espaço para abuso.
const LIMITE_CORPO_WEBHOOK_BYTES = 64 * 1024;

const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

const leitor = new LeitorDeCorpo();
const leitorDoWebhook = new LeitorDeCorpo(LIMITE_CORPO_WEBHOOK_BYTES);
const soCliente = new PerfisPermitidos("CLIENTE");
const limite = new LimiteDeTentativas(BancoDeDados.padrao);

const gateway = new GatewayStripe();

const pagamentos = new PagarReservaService({
  transacao: emTransacao,
  agora: () => new Date(),
  gerarId: randomUUID,
  gerarQrCode: gerarQrCodeBase64,
  gateway: () => gateway,
  clienteDoPagamento,
  registrarErro: (erro) => console.error("[pagamentos] consulta à Stripe falhou:", erro),
  // o limite só conta quando uma cobrança nova vai ser criada (reabrir a tela não conta)
  limitarCriacao: (sessao) =>
    limite.exigirDentroDoLimite(`pagamentos:usuario:${sessao.usuarioId}`, LIMITE_PAGAMENTOS_POR_USUARIO),
});

// As rotas 16 e 17 são do CLIENTE dono da reserva: 401 sem sessão válida, 403 para a equipe.
async function sessaoDoCliente(request: Request) {
  return soCliente.exigir(await sessoes.exigir(request));
}

// POST /api/pagamentos (rota 16): 201 com a cobrança nova, 200 se reaproveitou o Pix pendente.
export async function postPagamentos(request: Request) {
  try {
    const sessao = await sessaoDoCliente(request);
    const { cobranca, criada } = await pagamentos.iniciar(sessao, await leitor.lerJson(request));
    return criada ? Resposta.criada(cobranca, SEM_CACHE) : Resposta.ok(cobranca, SEM_CACHE);
  } catch (erro) {
    return Resposta.deErro(erro);
  }
}

// GET /api/pagamentos/{reservaId}/status (rota 17). Sem limite de tentativas: a tela consulta a
// cada 3 segundos enquanto o Pix está aberto.
export async function getStatusDoPagamento(request: Request, reservaId: string) {
  try {
    const sessao = await sessaoDoCliente(request);
    return Resposta.ok(await pagamentos.consultarStatus(sessao, reservaId), SEM_CACHE);
  } catch (erro) {
    return Resposta.deErro(erro);
  }
}

// POST /api/pagamentos/webhook (rota 18): aviso da Stripe. Sem token de usuário; a autenticação é a
// assinatura (stripe-signature). Responde 200 também para eventos que não interessam.
export async function postWebhookDePagamento(request: Request) {
  try {
    const corpo = await leitorDoWebhook.lerTexto(request);
    let aviso;
    try {
      aviso = lerAvisoDaStripe(corpo, request.headers.get("stripe-signature"));
    } catch (erro) {
      if (erro instanceof AssinaturaInvalida) throw new UnauthorizedError(erro.message);
      throw erro;
    }
    const resultado = aviso ? await pagamentos.processarAviso(aviso.idExterno, aviso.situacao) : "ignorado";
    return Resposta.ok({ recebido: true, resultado }, SEM_CACHE);
  } catch (erro) {
    return Resposta.deErro(erro);
  }
}
