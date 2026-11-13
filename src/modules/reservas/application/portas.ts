import type { SessaoBanco } from "../../../shared/db/sessao.ts";
import type { StatusReserva } from "../domain/reserva.ts";

// Quem faz a chamada: o cliente logado, como o exigirPerfil devolve. A mesma sessão vai para o
// comSessao, então as políticas de RLS valem.
export type SessaoCliente = SessaoBanco & { perfil: "CLIENTE"; usuarioId: string };

// Uma reserva como o banco a devolve (view reserva_detalhada), já com as datas como Date.
export type LinhaReserva = {
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

export type TipoReservavel = {
  id: string;
  nome: string;
  precoHoraCentavos: number;
  precoDiaCentavos: number;
  valorCaucaoCentavos: number;
};

export type ReservaParaGravar = {
  codigo: string;
  clienteId: string;
  bicicletaId: string;
  pontoId: string;
  inicio: Date;
  fim: Date;
  valorAluguelCentavos: number;
  valorCaucaoCentavos: number;
};

// O que se pode fazer dentro de UMA transação do banco (a que o comSessao abre). Os casos de uso
// só falam com esta interface, então os testes trocam o banco por uma versão em memória.
export type OperacoesReservas = {
  // marca como EXPIRADA toda pendente vencida (função expirar_reservas_vencidas, migration 0008)
  expirarVencidas(): Promise<void>;
  // tipo ATIVO ou null
  buscarTipo(tipoId: string): Promise<TipoReservavel | null>;
  // uma unidade livre do tipo no período, travada até o fim da transação, fora das já tentadas
  escolherUnidade(
    tipoId: string,
    inicio: Date,
    fim: Date,
    excluir: string[],
  ): Promise<{ bicicletaId: string; pontoId: string } | null>;
  // grava a reserva PENDENTE_PAGAMENTO e devolve como ficou. Lança SobreposicaoDePeriodo (23P01)
  // ou CodigoRepetido (23505) sem estragar a transação (cada tentativa tem o seu SAVEPOINT).
  inserir(reserva: ReservaParaGravar): Promise<LinhaReserva>;
  listar(status: StatusReserva | null): Promise<LinhaReserva[]>;
  buscar(id: string): Promise<LinhaReserva | null>;
  // trava a reserva do cliente e devolve o status, ou null se não existe (ou não é dele)
  travarStatus(id: string): Promise<StatusReserva | null>;
  marcarCancelada(id: string): Promise<void>;
};

export type Transacao = <T>(
  sessao: SessaoCliente,
  fn: (operacoes: OperacoesReservas) => Promise<T>,
) => Promise<T>;
