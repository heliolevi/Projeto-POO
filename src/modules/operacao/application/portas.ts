import type { BicicletaAdmin } from "@/modules/catalogo";
import type { Reserva } from "@/modules/reservas";
import type { SessaoBanco } from "../../../shared/db/sessao.ts";
import type { MovimentacaoParaPersistir } from "../domain/movimentacao.ts";

// Quem chama as rotas 26 e 27: alguém da equipe (OPERADOR ou ADMIN), como o exigirPerfil devolve. A
// mesma sessão vai para o comSessao, então as políticas de RLS da equipe valem.
export type SessaoEquipe = SessaoBanco & { perfil: "OPERADOR" | "ADMIN"; usuarioId: string };

// A reserva como o banco a devolve (view reserva_detalhada), no formato que a classe Reserva recebe.
export type LinhaReserva = ConstructorParameters<typeof Reserva>[0];

// A unidade como o catálogo a monta (o formato que a classe Bicicleta recebe).
export type LinhaBicicleta = BicicletaAdmin;

// O que se pode fazer dentro de UMA transação do banco. O OperacaoService só fala com esta
// interface, então os testes trocam o banco por uma versão em memória.
export type OperacoesOperacao = {
  // marca como EXPIRADA toda pendente vencida (expirar_reservas_vencidas, migration 0008)
  expirarVencidas(): Promise<void>;
  // trava a reserva até o fim da transação e devolve como ela está depois da trava, ou null
  travarReserva(id: string): Promise<LinhaReserva | null>;
  // trava a unidade da reserva (depois da reserva, sempre nesta ordem) e devolve como ela está
  travarBicicletaDaReserva(reservaId: string): Promise<LinhaBicicleta | null>;
  // outra reserva da mesma unidade ainda EM_ANDAMENTO (a bicicleta não voltou), ou null
  outraReservaEmAndamento(bicicletaId: string, reservaId: string): Promise<{ codigo: string } | null>;
  // grava a retirada ou a devolução. Lança ConflictError (409) se já existe uma do mesmo tipo.
  registrarMovimentacao(movimentacao: MovimentacaoParaPersistir): Promise<void>;
  // muda o status da reserva, só se ela ainda estiver no status `de` (devolve se mudou)
  mudarStatus(id: string, de: string, para: string): Promise<boolean>;
  // a unidade (bicicleta) da reserva: só a equipe vê
  bicicletaDaReserva(id: string): Promise<{ id: string; codigo: string } | null>;
};

export type TransacaoOperacao = <T>(
  sessao: SessaoEquipe,
  fn: (operacoes: OperacoesOperacao) => Promise<T>,
) => Promise<T>;
