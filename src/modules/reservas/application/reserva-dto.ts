import {
  Reserva,
  type ReservaDetalhadaDto,
  type ReservaDto,
} from "../domain/reserva-entidade.ts";
import type { LinhaReserva } from "./portas.ts";

// O objeto `reserva` do contrato (docs/contrato-api-mvp.md) é montado pela própria classe Reserva:
// a regra do `expiraEm` e o formato das datas moram no domínio, não aqui.
export type { ReservaDetalhadaDto, ReservaDto };

// Transforma a linha do banco na resposta da API, passando pela classe Reserva. Só tem métodos
// estáticos: não guarda estado.
export class MontadorDeReserva {
  private constructor() {
    throw new Error("MontadorDeReserva só tem membros estáticos.");
  }

  static reserva(linha: LinhaReserva): ReservaDto {
    return new Reserva(linha).paraDto();
  }

  static detalhada(linha: LinhaReserva): ReservaDetalhadaDto {
    return new Reserva(linha).paraDtoDetalhado();
  }
}
