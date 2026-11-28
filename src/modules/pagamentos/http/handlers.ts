import { randomUUID } from "node:crypto";
import { sessoes } from "@/modules/contas";
import { BancoDeDados } from "@/shared/db/banco-de-dados";
import { LimiteDeTentativas } from "@/shared/db/limite-tentativas";
import { PagarReservaService } from "../application/pagar-reserva";
import { LeitorDeAvisoDaStripe } from "../infrastructure/aviso-da-stripe";
import { GatewayStripe } from "../infrastructure/gateway-stripe";
import { QrCodePng } from "../infrastructure/qr-code";
import { RepositorioDePagamentosNoBanco } from "../infrastructure/repositorio-pagamentos";
import { ControladorDePagamentos, LIMITE_PAGAMENTOS_POR_USUARIO } from "./controlador-de-pagamentos";

// A ligação do módulo: o caso de uso com o banco, a Stripe, o QR code e o limite de cobranças; o
// controlador com a sessão real do módulo contas e o leitor do webhook assinado. Criado uma vez só:
// nada aqui guarda estado entre pedidos.
const banco = RepositorioDePagamentosNoBanco.padrao;
const limite = new LimiteDeTentativas(BancoDeDados.padrao);

const controlador = new ControladorDePagamentos({
  exigirSessao: (request) => sessoes.exigir(request),
  avisos: LeitorDeAvisoDaStripe.padrao,
  pagamentos: new PagarReservaService({
    transacao: (sessao, fn) => banco.emTransacao(sessao, fn),
    agora: () => new Date(),
    gerarId: randomUUID,
    gerarQrCode: (texto) => QrCodePng.padrao.gerarBase64(texto),
    gateway: () => GatewayStripe.padrao,
    clienteDoPagamento: (idExterno) => banco.clienteDoPagamento(idExterno),
    registrarErro: (erro) => console.error("[pagamentos] consulta à Stripe falhou:", erro),
    // o limite só conta quando uma cobrança nova vai ser criada (reabrir a tela não conta)
    limitarCriacao: (sessao) =>
      limite.exigirDentroDoLimite(`pagamentos:usuario:${sessao.usuarioId}`, LIMITE_PAGAMENTOS_POR_USUARIO),
  }),
});

// POST /api/pagamentos (rota 16); só chama o controlador (o Next exige a função exportada em route.ts).
export const postPagamentos = (request: Request) => controlador.criar(request);

// GET /api/pagamentos/{reservaId}/status (rota 17).
export const getStatusDoPagamento = (request: Request, reservaId: string) =>
  controlador.consultarStatus(request, reservaId);

// POST /api/pagamentos/webhook (rota 18): aviso da Stripe.
export const postWebhookDePagamento = (request: Request) => controlador.receberAviso(request);
