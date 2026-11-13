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
  type Periodo,
  type Precos,
} from "./domain/preco";
export {
  calcularExpiraEm,
  ehStatusReserva,
  PRAZO_PAGAMENTO_MS,
  podeCancelar,
  STATUS_RESERVA,
  type StatusReserva,
} from "./domain/reserva";
export type { Reserva, ReservaDetalhada } from "./application/reserva-dto";
export { getReserva, getReservas, postCancelarReserva, postReservas } from "./http/handlers";
