import { calcularExpiraEm, type StatusReserva } from "../domain/reserva.ts";
import type { LinhaReserva } from "./portas.ts";

// Objeto `reserva` do contrato (docs/contrato-api-mvp.md). O código da unidade (bicicleta) não
// entra: é só da equipe.
export type Reserva = {
  id: string;
  codigo: string;
  status: StatusReserva;
  tipo: { id: string; nome: string };
  ponto: { id: string; nome: string; endereco: string };
  periodo: { inicio: string; fim: string };
  valorAluguelCentavos: number;
  valorCaucaoCentavos: number;
  expiraEm: string | null;
  criadaEm: string;
};

export type ReservaDetalhada = Reserva & {
  pagamento: { status: string; metodo: string } | null;
};

export function montarReserva(linha: LinhaReserva): Reserva {
  return {
    id: linha.id,
    codigo: linha.codigo,
    status: linha.status,
    tipo: { id: linha.tipoId, nome: linha.tipoNome },
    ponto: { id: linha.pontoId, nome: linha.pontoNome, endereco: linha.pontoEndereco },
    periodo: { inicio: linha.inicio.toISOString(), fim: linha.fim.toISOString() },
    valorAluguelCentavos: linha.valorAluguelCentavos,
    valorCaucaoCentavos: linha.valorCaucaoCentavos,
    expiraEm: calcularExpiraEm(linha.status, linha.criadoEm)?.toISOString() ?? null,
    criadaEm: linha.criadoEm.toISOString(),
  };
}

export function montarReservaDetalhada(linha: LinhaReserva): ReservaDetalhada {
  return {
    ...montarReserva(linha),
    pagamento:
      linha.pagamentoStatus && linha.pagamentoMetodo
        ? { status: linha.pagamentoStatus, metodo: linha.pagamentoMetodo }
        : null,
  };
}
