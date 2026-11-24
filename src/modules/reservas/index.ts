/**
 * Módulo reservas — Criação e ciclo de vida das reservas; impede sobreposição para a mesma bicicleta.
 *
 * API pública do módulo: apenas o que for exportado aqui pode ser importado por
 * outros módulos ou pelos Route Handlers em src/app/api.
 * Camadas internas: domain → application → infrastructure / http.
 */
export {
  calcularValorAluguel,
  horasCobradas,
  type PeriodoCobravel as Periodo,
  type Precos,
} from "../../shared/dominio/preco-aluguel";
export {
  calcularExpiraEm,
  ehStatusReserva,
  PRAZO_PAGAMENTO_MS,
  podeCancelar,
  STATUS_RESERVA,
  type StatusReserva,
} from "./domain/reserva";
export type { ReservaDetalhadaDto, ReservaDto } from "./application/reserva-dto";
export { TransicaoDeReservaInvalida } from "./domain/erros";
export { ANTECEDENCIA_DA_RETIRADA_MS, Reserva } from "./domain/reserva-entidade";
export { podeTransitar, TRANSICOES } from "./domain/reserva";
export { getReserva, getReservas, postCancelarReserva, postReservas } from "./http/handlers";
export { ReservaService } from "./application/reserva-service";
