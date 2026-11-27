import { ConflictError } from "../../../shared/http/errors.ts";
import type { Checklist, ItemDoChecklistDto } from "./checklist.ts";

export type TipoMovimentacao = "RETIRADA" | "DEVOLUCAO";

// 409: a retirada ou a devolução não pode acontecer agora (bicicleta indisponível, ainda na rua...).
export class MovimentacaoInvalida extends ConflictError {}

/** Como a movimentação vai para a tabela `movimentacao` (migration 0010). */
export type MovimentacaoParaPersistir = {
  reservaId: string;
  operadorId: string;
  tipo: TipoMovimentacao;
  itens: ItemDoChecklistDto[];
  observacoes: string | null;
  dataHora: Date;
};

type DadosDaMovimentacao = {
  reservaId: string;
  operadorId: string;
  checklist: Checklist;
  dataHora: Date;
};

// A retirada ou a devolução de uma bicicleta no balcão: quem atendeu, quando e o checklist. Nasce
// por Movimentacao.retirada() ou Movimentacao.devolucao(), não muda depois de criada e não lê o
// relógio (quem chama passa a dataHora). As regras de quando ela pode acontecer ficam na Reserva
// (status e janela) e na Bicicleta (disponível); o OperacaoService coordena as três.
export class Movimentacao {
  readonly #tipo: TipoMovimentacao;
  readonly #reservaId: string;
  readonly #operadorId: string;
  readonly #checklist: Checklist;
  readonly #dataHora: Date;

  private constructor(tipo: TipoMovimentacao, dados: DadosDaMovimentacao) {
    if (!dados.reservaId) throw new RangeError("A movimentação precisa de uma reserva.");
    if (!dados.operadorId) throw new RangeError("A movimentação precisa do operador que atendeu.");
    if (Number.isNaN(dados.dataHora.getTime())) throw new RangeError("A data da movimentação é inválida.");
    this.#tipo = tipo;
    this.#reservaId = dados.reservaId;
    this.#operadorId = dados.operadorId;
    this.#checklist = dados.checklist;
    this.#dataHora = new Date(dados.dataHora.getTime());
  }

  static retirada(dados: DadosDaMovimentacao): Movimentacao {
    return new Movimentacao("RETIRADA", dados);
  }

  static devolucao(dados: DadosDaMovimentacao): Movimentacao {
    return new Movimentacao("DEVOLUCAO", dados);
  }

  get tipo(): TipoMovimentacao {
    return this.#tipo;
  }

  get reservaId(): string {
    return this.#reservaId;
  }

  get operadorId(): string {
    return this.#operadorId;
  }

  get checklist(): Checklist {
    return this.#checklist;
  }

  get dataHora(): Date {
    return new Date(this.#dataHora.getTime());
  }

  paraPersistir(): MovimentacaoParaPersistir {
    return {
      reservaId: this.#reservaId,
      operadorId: this.#operadorId,
      tipo: this.#tipo,
      itens: this.#checklist.itensParaPersistir(),
      observacoes: this.#checklist.observacoes,
      dataHora: this.dataHora,
    };
  }
}
