import { Dinheiro } from "../../../shared/dominio/dinheiro.ts";
import { Periodo } from "../../../shared/dominio/periodo-aluguel.ts";
import { RegrasDeReserva, type StatusReserva } from "./reserva.ts";

/** Uma reserva como o banco a entrega ao painel: o cliente e a unidade já vêm juntos. */
export type DadosDaReservaDoPainel = {
  id: string;
  codigo: string;
  status: StatusReserva;
  clienteId: string;
  clienteNome: string;
  tipoId: string;
  tipoNome: string;
  bicicletaId: string;
  bicicletaCodigo: string;
  inicio: Date;
  fim: Date;
  valorAluguelCentavos: number;
};

/** O item de GET /api/admin/reservas (contrato, rota 25). */
export type ReservaDoPainelDto = {
  id: string;
  codigo: string;
  status: StatusReserva;
  cliente: { id: string; nome: string };
  tipo: { id: string; nome: string };
  bicicleta: { id: string; codigo: string };
  periodo: { inicio: string; fim: string };
  valorAluguelCentavos: number;
};

// A reserva na visão da equipe (balcão e administrador): além do que o cliente vê, traz o nome do
// cliente e QUAL unidade foi escolhida (o código da bicicleta só aparece para a equipe). É uma
// visão de leitura; quem muda a reserva é a classe Reserva. Os campos são privados e o objeto não
// muda depois de criado.
export class ReservaDoPainel {
  readonly #id: string;
  readonly #codigo: string;
  readonly #status: StatusReserva;
  readonly #clienteId: string;
  readonly #clienteNome: string;
  readonly #tipoId: string;
  readonly #tipoNome: string;
  readonly #bicicletaId: string;
  readonly #bicicletaCodigo: string;
  readonly #periodo: Periodo;
  readonly #valorAluguel: Dinheiro;

  constructor(dados: DadosDaReservaDoPainel) {
    for (const [nome, valor] of [
      ["id", dados.id],
      ["código", dados.codigo],
      ["id do cliente", dados.clienteId],
      ["id do tipo", dados.tipoId],
      ["id da bicicleta", dados.bicicletaId],
      ["código da bicicleta", dados.bicicletaCodigo],
    ] as const) {
      if (typeof valor !== "string" || valor.trim() === "") throw new RangeError(`A reserva do painel precisa do ${nome}.`);
    }
    if (!RegrasDeReserva.ehStatus(dados.status)) throw new RangeError(`Status de reserva desconhecido: ${String(dados.status)}`);
    this.#id = dados.id;
    this.#codigo = dados.codigo;
    this.#status = dados.status;
    this.#clienteId = dados.clienteId;
    this.#clienteNome = dados.clienteNome;
    this.#tipoId = dados.tipoId;
    this.#tipoNome = dados.tipoNome;
    this.#bicicletaId = dados.bicicletaId;
    this.#bicicletaCodigo = dados.bicicletaCodigo;
    this.#periodo = Periodo.de(dados.inicio, dados.fim);
    this.#valorAluguel = Dinheiro.deCentavos(dados.valorAluguelCentavos);
  }

  get id(): string {
    return this.#id;
  }

  get status(): StatusReserva {
    return this.#status;
  }

  get periodo(): Periodo {
    return this.#periodo;
  }

  paraDto(): ReservaDoPainelDto {
    return {
      id: this.#id,
      codigo: this.#codigo,
      status: this.#status,
      cliente: { id: this.#clienteId, nome: this.#clienteNome },
      tipo: { id: this.#tipoId, nome: this.#tipoNome },
      bicicleta: { id: this.#bicicletaId, codigo: this.#bicicletaCodigo },
      periodo: this.#periodo.toJSON(),
      valorAluguelCentavos: this.#valorAluguel.centavos,
    };
  }

  toJSON(): ReservaDoPainelDto {
    return this.paraDto();
  }
}
