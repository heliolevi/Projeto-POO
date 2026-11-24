import type { Periodo } from "../../../shared/dominio/periodo-aluguel.ts";
import { criarCancelarReserva } from "./cancelar-reserva.ts";
import { criarBuscarReserva, criarListarReservas } from "./consultar-reservas.ts";
import { criarCriarReserva, type DependenciasCriarReserva } from "./criar-reserva.ts";
import type { SessaoCliente } from "./portas.ts";
import type { ReservaDetalhadaDto, ReservaDto } from "./reserva-dto.ts";

// Serviço de aplicação das reservas: a porta de entrada que as rotas usam. Reúne os casos de uso
// (criar, listar, buscar, cancelar, expirar) numa só classe, com as dependências recebidas no
// construtor (transação, relógio, gerador de código e regra de preço). Como a classe não guarda
// estado entre chamadas (a sessão chega a cada uma), uma instância serve a todas as requisições.
export class ReservaService {
  readonly #deps: DependenciasCriarReserva;
  readonly #criar: ReturnType<typeof criarCriarReserva>;
  readonly #listar: ReturnType<typeof criarListarReservas>;
  readonly #buscar: ReturnType<typeof criarBuscarReserva>;
  readonly #cancelar: ReturnType<typeof criarCancelarReserva>;

  constructor(deps: DependenciasCriarReserva) {
    this.#deps = deps;
    this.#criar = criarCriarReserva(deps);
    this.#listar = criarListarReservas({ transacao: deps.transacao });
    this.#buscar = criarBuscarReserva({ transacao: deps.transacao });
    this.#cancelar = criarCancelarReserva({ transacao: deps.transacao, agora: deps.agora });
  }

  // POST /api/reservas (rota 12)
  criarReserva(sessao: SessaoCliente, corpo: unknown): Promise<ReservaDto> {
    return this.#criar(sessao, corpo);
  }

  // GET /api/reservas (rota 13)
  listarReservas(sessao: SessaoCliente, filtros: { status?: unknown }): Promise<ReservaDto[]> {
    return this.#listar(sessao, filtros);
  }

  // GET /api/reservas/{id} (rota 14)
  buscarReserva(sessao: SessaoCliente, id: unknown): Promise<ReservaDetalhadaDto> {
    return this.#buscar(sessao, id);
  }

  // POST /api/reservas/{id}/cancelar (rota 15)
  cancelarReserva(sessao: SessaoCliente, id: unknown): Promise<ReservaDto> {
    return this.#cancelar(sessao, id);
  }

  // Marca como EXPIRADA toda pendente vencida (a função expirar_reservas_vencidas() do banco), para
  // a exclusion constraint liberar a bicicleta. As rotas já fazem isso antes de cada operação; este
  // método existe para uma chamada periódica.
  expirarPendentes(sessao: SessaoCliente): Promise<void> {
    return this.#deps.transacao(sessao, (op) => op.expirarVencidas());
  }

  // Resposta rápida ao cliente: o período pedido bate com alguma ocupação? Quem garante de verdade é
  // a exclusion constraint do banco; esta conferência só evita uma ida ao banco quando já se sabe.
  verificarConflito(periodo: Periodo, ocupacoes: readonly Periodo[]): boolean {
    return ocupacoes.some((ocupado) => ocupado.sobrepoe(periodo));
  }
}
