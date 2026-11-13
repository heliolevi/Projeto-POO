import { Dinheiro } from "../../../shared/dominio/dinheiro.ts";
import { Periodo } from "../../../shared/dominio/periodo-aluguel.ts";
import { calcularValorAluguel, type Precos } from "../../../shared/dominio/preco-aluguel.ts";
import { TransicaoDeReservaInvalida } from "./erros.ts";
import { calcularExpiraEm, podeTransitar, type StatusReserva } from "./reserva.ts";

// Resposta 409 de POST /api/reservas/{id}/cancelar (docs/contrato-api-mvp.md).
export const MENSAGEM_CANCELAMENTO_RECUSADO =
  "Esta reserva não pode mais ser cancelada: só vale para reserva pendente ou confirmada, antes da retirada.";

// A retirada só vale a partir de 30 minutos antes do início da reserva (docs/contrato-api-mvp.md).
export const ANTECEDENCIA_DA_RETIRADA_MS = 30 * 60 * 1000;

// Como a reserva é lida do banco (a view reserva_detalhada), com as datas já como Date.
export type DadosDeReservaPersistida = {
  id: string;
  codigo: string;
  status: StatusReserva;
  tipoId: string;
  tipoNome: string;
  pontoId: string;
  pontoNome: string;
  pontoEndereco: string;
  inicio: Date;
  fim: Date;
  valorAluguelCentavos: number;
  valorCaucaoCentavos: number;
  criadoEm: Date;
  pagamentoStatus: string | null;
  pagamentoMetodo: string | null;
};

// Objeto `reserva` do contrato (docs/contrato-api-mvp.md). O código da unidade (bicicleta) não
// entra: é só da equipe.
export type ReservaDto = {
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

export type ReservaDetalhadaDto = ReservaDto & {
  pagamento: { status: string; metodo: string } | null;
};

// O que o cliente compra e a locadora opera: uma bicicleta de um tipo, num ponto, por um período.
//
// Encapsulamento: o status é privado e só muda pelos métodos de ciclo de vida (confirmar, cancelar,
// iniciar, concluir, expirar, marcarNaoRetirada), todos conferidos na tabela TRANSICOES; uma
// transição inválida lança TransicaoDeReservaInvalida (409) e deixa a reserva como estava. O
// período e o valor só mudam por estender().
//
// O relógio nunca é lido aqui: quem chama passa `agora`, então toda regra de tempo é testável.
export class Reserva {
  readonly #id: string;
  readonly #codigo: string;
  readonly #tipo: { id: string; nome: string };
  readonly #ponto: { id: string; nome: string; endereco: string };
  readonly #criadaEm: Date;
  readonly #valorCaucao: Dinheiro;
  #periodo: Periodo;
  #valorAluguel: Dinheiro;
  #status: StatusReserva;
  #pagamento: { status: string; metodo: string } | null;
  #canceladaEm: Date | null = null;
  #motivoDoCancelamento: string | null = null;

  constructor(dados: DadosDeReservaPersistida) {
    if (!dados.id) throw new RangeError("A reserva precisa de um id.");
    if (!dados.codigo) throw new RangeError("A reserva precisa de um código.");
    this.#id = dados.id;
    this.#codigo = dados.codigo;
    this.#status = dados.status;
    this.#tipo = { id: dados.tipoId, nome: dados.tipoNome };
    this.#ponto = { id: dados.pontoId, nome: dados.pontoNome, endereco: dados.pontoEndereco };
    this.#periodo = Periodo.de(dados.inicio, dados.fim);
    this.#valorAluguel = Dinheiro.deCentavos(dados.valorAluguelCentavos);
    this.#valorCaucao = Dinheiro.deCentavos(dados.valorCaucaoCentavos);
    this.#criadaEm = new Date(dados.criadoEm);
    this.#pagamento =
      dados.pagamentoStatus && dados.pagamentoMetodo
        ? { status: dados.pagamentoStatus, metodo: dados.pagamentoMetodo }
        : null;
  }

  get id(): string {
    return this.#id;
  }
  get codigo(): string {
    return this.#codigo;
  }
  get status(): StatusReserva {
    return this.#status;
  }
  get tipoId(): string {
    return this.#tipo.id;
  }
  get pontoId(): string {
    return this.#ponto.id;
  }
  get periodo(): Periodo {
    return this.#periodo;
  }
  get valorAluguel(): Dinheiro {
    return this.#valorAluguel;
  }
  get valorCaucao(): Dinheiro {
    return this.#valorCaucao;
  }
  get criadaEm(): Date {
    return new Date(this.#criadaEm);
  }
  get canceladaEm(): Date | null {
    return this.#canceladaEm === null ? null : new Date(this.#canceladaEm);
  }
  get motivoDoCancelamento(): string | null {
    return this.#motivoDoCancelamento;
  }

  // Só a reserva pendente tem prazo: a criação mais 15 minutos (o mesmo prazo de
  // expirar_reservas_vencidas() no banco).
  expiraEm(): Date | null {
    return calcularExpiraEm(this.#status, this.#criadaEm);
  }

  // Segura a bicicleta (conta na exclusion constraint): pendente, confirmada ou em andamento.
  estaAtiva(): boolean {
    return (
      this.#status === "PENDENTE_PAGAMENTO" ||
      this.#status === "CONFIRMADA" ||
      this.#status === "EM_ANDAMENTO"
    );
  }

  // Pagamento aprovado: PENDENTE_PAGAMENTO -> CONFIRMADA. Uma reserva cujo prazo já venceu não se
  // confirma (o banco a marcaria como EXPIRADA).
  confirmar(agora: Date): void {
    this.#exigirTransicao("CONFIRMADA", "confirmar");
    const prazo = this.expiraEm();
    if (prazo !== null && agora.getTime() >= prazo.getTime()) {
      throw new TransicaoDeReservaInvalida("Não é possível confirmar: o prazo de pagamento da reserva já venceu.");
    }
    this.#status = "CONFIRMADA";
  }

  // Cancelamento pelo cliente (ou pelo balcão) antes da retirada: pendente ou confirmada.
  cancelar(motivo: string, agora: Date): void {
    if (motivo.trim().length === 0) throw new RangeError("Informe o motivo do cancelamento.");
    // a mensagem é a do contrato da API (rota 15): é o que o cliente lê no 409
    if (!podeTransitar(this.#status, "CANCELADA")) {
      throw new TransicaoDeReservaInvalida(MENSAGEM_CANCELAMENTO_RECUSADO);
    }
    this.#status = "CANCELADA";
    this.#motivoDoCancelamento = motivo.trim();
    this.#canceladaEm = new Date(agora);
  }

  // Retirada: CONFIRMADA -> EM_ANDAMENTO, a partir de 30 minutos antes do início e até o fim.
  iniciar(agora: Date): void {
    this.#exigirTransicao("EM_ANDAMENTO", "iniciar");
    const t = agora.getTime();
    if (t < this.#periodo.inicio.getTime() - ANTECEDENCIA_DA_RETIRADA_MS) {
      throw new TransicaoDeReservaInvalida("Ainda não é hora da retirada: ela abre 30 minutos antes do início da reserva.");
    }
    if (t >= this.#periodo.fim.getTime()) {
      throw new TransicaoDeReservaInvalida("O período desta reserva já terminou: não dá mais para retirar a bicicleta.");
    }
    this.#status = "EM_ANDAMENTO";
  }

  // Devolução: EM_ANDAMENTO -> CONCLUIDA (o atraso, se houver, vira uma ocorrência).
  concluir(): void {
    this.#exigirTransicao("CONCLUIDA", "concluir");
    this.#status = "CONCLUIDA";
  }

  // Varredura de pendentes vencidas: marca EXPIRADA se a reserva é pendente e já passou do prazo.
  // Devolve se expirou; não lança nada, porque é chamada sobre qualquer reserva.
  expirar(agora: Date): boolean {
    const prazo = this.expiraEm();
    if (prazo === null || agora.getTime() < prazo.getTime()) return false;
    this.#status = "EXPIRADA";
    return true;
  }

  // O cliente não apareceu: CONFIRMADA -> NAO_RETIRADA, só depois do fim do período.
  marcarNaoRetirada(agora: Date): void {
    this.#exigirTransicao("NAO_RETIRADA", "marcar como não retirada");
    if (agora.getTime() < this.#periodo.fim.getTime()) {
      throw new TransicaoDeReservaInvalida("A reserva ainda está dentro do período: não dá para marcá-la como não retirada.");
    }
    this.#status = "NAO_RETIRADA";
  }

  // Valor do aluguel deste período pelos preços do tipo (a regra única de preço do sistema).
  calcularValor(precos: Precos): Dinheiro {
    return Dinheiro.deCentavos(calcularValorAluguel(this.#periodo, precos));
  }

  // Passou do fim e a bicicleta ainda não voltou.
  estaAtrasada(agora: Date): boolean {
    return this.#status === "EM_ANDAMENTO" && agora.getTime() > this.#periodo.fim.getTime();
  }

  // Milissegundos de atraso na devolução (0 se não está atrasada).
  atrasoEmMs(agora: Date): number {
    return this.estaAtrasada(agora) ? agora.getTime() - this.#periodo.fim.getTime() : 0;
  }

  // Alonga o aluguel (confirmada ou em andamento). O novo valor é calculado por quem chama, com os
  // preços do tipo, e só entra se o período novo for válido.
  estender(novoFim: Date, calcularNovoValor: (periodo: Periodo) => Dinheiro): void {
    if (this.#status !== "CONFIRMADA" && this.#status !== "EM_ANDAMENTO") {
      throw new TransicaoDeReservaInvalida("Só é possível estender uma reserva confirmada ou em andamento.");
    }
    if (novoFim.getTime() <= this.#periodo.fim.getTime()) {
      throw new RangeError("O novo fim precisa ser depois do fim atual.");
    }
    const novoPeriodo = this.#periodo.comNovoFim(novoFim);
    const novoValor = calcularNovoValor(novoPeriodo);
    this.#periodo = novoPeriodo;
    this.#valorAluguel = novoValor;
  }

  #exigirTransicao(para: StatusReserva, verbo: string): void {
    if (!podeTransitar(this.#status, para)) {
      throw new TransicaoDeReservaInvalida(
        `Não é possível ${verbo}: a reserva está ${this.#status} e não pode passar para ${para}.`,
      );
    }
  }

  // A visão da API (rotas 12 a 15). `expiraEm` só existe na reserva pendente.
  paraDto(): ReservaDto {
    return {
      id: this.#id,
      codigo: this.#codigo,
      status: this.#status,
      tipo: { ...this.#tipo },
      ponto: { ...this.#ponto },
      periodo: {
        inicio: this.#periodo.inicio.toISOString(),
        fim: this.#periodo.fim.toISOString(),
      },
      valorAluguelCentavos: this.#valorAluguel.centavos,
      valorCaucaoCentavos: this.#valorCaucao.centavos,
      expiraEm: this.expiraEm()?.toISOString() ?? null,
      criadaEm: this.#criadaEm.toISOString(),
    };
  }

  paraDtoDetalhado(): ReservaDetalhadaDto {
    return { ...this.paraDto(), pagamento: this.#pagamento === null ? null : { ...this.#pagamento } };
  }
}
