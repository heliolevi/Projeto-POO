import type { SessaoBanco } from "../../../shared/db/sessao.ts";
import type { Pagamento, StatusPagamento } from "../domain/pagamento.ts";
import type { RepositorioDePagamentos, ReservaParaPagar } from "./pagamento-service.ts";

// Quem chama as rotas 16 e 17: o cliente logado, como o PerfisPermitidos devolve. A mesma sessão vai para
// o comSessao, então as políticas de RLS valem (o cliente só enxerga as próprias reservas e os
// pagamentos delas). O aviso da Stripe (webhook) também roda com a sessão do cliente dono do
// pagamento, para passar pelas mesmas políticas.
export type SessaoCliente = SessaoBanco & { perfil: "CLIENTE"; usuarioId: string };

// Situação de uma reserva para a tela do Pix (rota 17). statusPagamento é o do pagamento mais
// recente da reserva, ou null se ela ainda não tem cobrança.
export type SituacaoDaReserva = {
  statusReserva: string;
  statusPagamento: StatusPagamento | null;
};

// Quem paga, como vai para o meio de pagamento (a Stripe pede nome e e-mail no Pix).
export type Pagador = { nome: string; email: string };

// O que se pode fazer dentro de UMA transação do banco (a que o comSessao abre). Os casos de uso só
// falam com esta interface, então os testes trocam o banco por uma versão em memória.
export type OperacoesPagamento = RepositorioDePagamentos & {
  // marca como EXPIRADA toda pendente vencida (expirar_reservas_vencidas, migration 0008), para não
  // cobrar uma reserva que já devia ter caído (issue #73)
  expirarVencidas(): Promise<void>;
  // trava a reserva do cliente até o fim da transação (FOR UPDATE) e devolve o que o pagamento
  // precisa dela, ou null se não existe (ou é de outro cliente: a RLS não deixa ver)
  travarReserva(reservaId: string): Promise<ReservaParaPagar | null>;
  situacao(reservaId: string): Promise<SituacaoDaReserva | null>;
  // PENDENTE_PAGAMENTO -> CONFIRMADA. Devolve false se a reserva já não estava pendente (ou o
  // prazo de 15 minutos venceu), e nesse caso nada muda.
  confirmarReserva(reservaId: string): Promise<boolean>;
  // nome e e-mail do cliente da sessão
  pagador(): Promise<Pagador | null>;
  // o pagamento ligado a uma cobrança do meio de pagamento (id do PaymentIntent), SEM trava: serve
  // para descobrir a reserva e travá-la primeiro (a ordem é sempre reserva, depois pagamento)
  buscarPorIdExterno(idExterno: string): Promise<Pagamento | null>;
  // o mesmo, travado (FOR UPDATE). Só depois de travarReserva da reserva dele.
  travarPorIdExterno(idExterno: string): Promise<Pagamento | null>;
};

export type TransacaoPagamento = <T>(
  sessao: SessaoCliente,
  fn: (operacoes: OperacoesPagamento) => Promise<T>,
) => Promise<T>;

// ---------------------------------------------------------------------------------------------
// Meio de pagamento (Stripe). Os casos de uso só conhecem esta interface; a implementação de
// verdade fica em infrastructure/gateway-stripe.ts e os testes usam uma de mentira.
// ---------------------------------------------------------------------------------------------

// Como a cobrança está no meio de pagamento, no vocabulário do sistema.
export type SituacaoNoGateway = "pendente" | "aprovado" | "recusado" | "expirado";

export type NovaCobrancaPix = {
  pagamentoId: string;
  reservaId: string;
  valorCentavos: number;
  // até quando o Pix vale (o mesmo prazo do pagamento no sistema)
  expiraEm: Date;
  pagador: Pagador;
};

export type GatewayPix = {
  // cria e confirma a cobrança Pix; devolve o id dela e o "copia e cola" verdadeiro
  criarCobrancaPix(dados: NovaCobrancaPix): Promise<{ idExterno: string; copiaECola: string }>;
  consultar(idExterno: string): Promise<SituacaoNoGateway>;
  // devolve ao cliente o valor inteiro de uma cobrança paga
  estornar(idExterno: string): Promise<void>;
  // cancela uma cobrança ainda não paga (a que nasceu na Stripe mas não chegou ao banco)
  cancelar(idExterno: string): Promise<void>;
};

// Imagem PNG do QR code do "copia e cola", em base64 (sem o prefixo data:).
export type GeradorDeQrCode = {
  gerarBase64(texto: string): Promise<string>;
};

// O aviso da Stripe (webhook), já com a assinatura conferida e traduzido: de qual cobrança e o que houve.
export type AvisoDoGateway = { idExterno: string; situacao: SituacaoNoGateway };

// Confere a assinatura do aviso e o traduz. Devolve null para o evento que não interessa. Lança
// AssinaturaInvalida (401) sem assinatura válida e PagamentoIndisponivelError (502) sem o segredo.
export type LeitorDeAviso = {
  ler(corpo: string, assinatura: string | null): AvisoDoGateway | null;
};

// O aviso chegou sem assinatura ou com uma assinatura que não confere. A rota responde 401.
export class AssinaturaInvalida extends Error {}
