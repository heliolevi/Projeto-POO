import {
  Reserva,
  type ReservaDetalhadaDto,
  type ReservaDto,
} from "../domain/reserva-entidade.ts";
import type { LinhaReserva } from "./portas.ts";

// O objeto `reserva` do contrato (docs/contrato-api-mvp.md) é montado pela própria classe Reserva:
// a regra do `expiraEm` e o formato das datas moram no domínio, não aqui.
export type { ReservaDetalhadaDto, ReservaDto };

export function montarReserva(linha: LinhaReserva): ReservaDto {
  return new Reserva(linha).paraDto();
}

export function montarReservaDetalhada(linha: LinhaReserva): ReservaDetalhadaDto {
  return new Reserva(linha).paraDtoDetalhado();
}
