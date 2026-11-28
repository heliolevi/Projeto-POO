import type { Periodo } from "../../../shared/dominio/periodo-aluguel.ts";
import { ValidadorDeNovaReserva } from "../domain/validador-de-nova-reserva.ts";
import { CancelamentoDeReserva } from "./cancelar-reserva.ts";
import { ConsultaDeReservas } from "./consultar-reservas.ts";
import { CriadorDeReserva } from "./criar-reserva.ts";
import type { CalculoDePreco, ExecutorDeReservas, GeradorDeCodigo, SessaoCliente } from "./portas.ts";
import type { ReservaDetalhadaDto, ReservaDto } from "./reserva-dto.ts";

export type DependenciasDoServico = {
  executor: ExecutorDeReservas;
  agora: () => Date;
  geradorDeCodigo: GeradorDeCodigo;
  calculadora: CalculoDePreco;
  /** Opcional: sem ele vale o ValidadorDeNovaReserva.padrao. */
  validador?: Pick<ValidadorDeNovaReserva, "validar">;
};

// Serviço de aplicação das reservas: a porta de entrada que as rotas usam. Reúne os casos de uso
// (criar, listar, buscar, cancelar, expirar) numa só classe, que delega cada um à sua classe
// (CriadorDeReserva, ConsultaDeReservas, CancelamentoDeReserva), com as dependências recebidas no
// construtor (executor da transação, relógio, gerador de código e regra de preço). Como a classe não
// guarda estado entre chamadas (a sessão chega a cada uma), uma instância serve a todas as requisições.
export class ReservaService {
  readonly #executor: ExecutorDeReservas;
  readonly #criador: CriadorDeReserva;
  readonly #consulta: ConsultaDeReservas;
  readonly #cancelamento: CancelamentoDeReserva;

  constructor(deps: DependenciasDoServico) {
    this.#executor = deps.executor;
    this.#criador = new CriadorDeReserva({
      executor: deps.executor,
      agora: deps.agora,
      geradorDeCodigo: deps.geradorDeCodigo,
      calculadora: deps.calculadora,
      validador: deps.validador ?? ValidadorDeNovaReserva.padrao,
    });
    this.#consulta = new ConsultaDeReservas(deps.executor);
    this.#cancelamento = new CancelamentoDeReserva({ executor: deps.executor, agora: deps.agora });
  }

  // POST /api/reservas (rota 12)
  criarReserva(sessao: SessaoCliente, corpo: unknown): Promise<ReservaDto> {
    return this.#criador.criar(sessao, corpo);
  }

  // GET /api/reservas (rota 13)
  listarReservas(sessao: SessaoCliente, filtros: { status?: unknown }): Promise<ReservaDto[]> {
    return this.#consulta.listar(sessao, filtros);
  }

  // GET /api/reservas/{id} (rota 14)
  buscarReserva(sessao: SessaoCliente, id: unknown): Promise<ReservaDetalhadaDto> {
    return this.#consulta.buscar(sessao, id);
  }

  // POST /api/reservas/{id}/cancelar (rota 15)
  cancelarReserva(sessao: SessaoCliente, id: unknown): Promise<ReservaDto> {
    return this.#cancelamento.cancelar(sessao, id);
  }

  // Marca como EXPIRADA toda pendente vencida (a função expirar_reservas_vencidas() do banco), para
  // a exclusion constraint liberar a bicicleta. As rotas já fazem isso antes de cada operação; este
  // método existe para uma chamada periódica.
  expirarPendentes(sessao: SessaoCliente): Promise<void> {
    return this.#executor.executar(sessao, (op) => op.expirarVencidas());
  }

  // Resposta rápida ao cliente: o período pedido bate com alguma ocupação? Quem garante de verdade é
  // a exclusion constraint do banco; esta conferência só evita uma ida ao banco quando já se sabe.
  verificarConflito(periodo: Periodo, ocupacoes: readonly Periodo[]): boolean {
    return ocupacoes.some((ocupado) => ocupado.sobrepoe(periodo));
  }
}
