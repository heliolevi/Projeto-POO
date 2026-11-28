/**
 * Módulo pagamentos — Cobrança do aluguel por Pix, com a Stripe como meio de pagamento (o cartão
 * existe no domínio, mas ainda não tem rota).
 *
 * API pública do módulo: apenas o que for exportado aqui pode ser importado por
 * outros módulos ou pelos Route Handlers em src/app/api.
 * Camadas internas: domain → application → infrastructure / http.
 */
export {
  FabricaDePagamento,
  PagamentoCartao,
  PagamentoPix,
  type CobrancaCartao,
  type CobrancaPix,
} from "./domain/formas-de-pagamento";
export {
  METODOS_PAGAMENTO,
  Pagamento,
  STATUS_PAGAMENTO,
  TransicaoDePagamentoInvalida,
  type CobrancaGerada,
  type MetodoPagamento,
  type StatusPagamento,
} from "./domain/pagamento";
export {
  PagamentoService,
  type EventoDePagamento,
  type RepositorioDePagamentos,
  type ReservaParaPagar,
} from "./application/pagamento-service";
export { IntervaloDeConsulta } from "./application/intervalo-de-consulta";
export {
  PagarReservaService,
  type CobrancaPixComQrCode,
  type DependenciasPagarReserva,
  type ResultadoDoAviso,
  type StatusDoPagamento,
} from "./application/pagar-reserva";
export { AssinaturaInvalida } from "./application/portas";
export type {
  AvisoDoGateway,
  GatewayPix,
  GeradorDeQrCode,
  LeitorDeAviso,
  SituacaoNoGateway,
} from "./application/portas";
export { ControladorDePagamentos } from "./http/controlador-de-pagamentos";
export { getStatusDoPagamento, postPagamentos, postWebhookDePagamento } from "./http/handlers";
