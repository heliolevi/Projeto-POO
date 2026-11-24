/**
 * Módulo pagamentos — Cobrança do aluguel por Pix e cartão (no MVP, pagamento simulado; a integração
 * com o Mercado Pago está em stand by).
 *
 * API pública do módulo: apenas o que for exportado aqui pode ser importado por
 * outros módulos ou pelos Route Handlers em src/app/api.
 * Camadas internas: domain → application → infrastructure / http.
 */
export {
  criarPagamento,
  PagamentoCartao,
  PagamentoPix,
  PRAZO_DO_PIX_MS,
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
