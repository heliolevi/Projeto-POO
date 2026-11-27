import type { Bicicleta } from "@/modules/catalogo";
import type { Reserva, ReservaDto } from "@/modules/reservas";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/http/errors.ts";
import { Checklist } from "../domain/checklist.ts";
import { Movimentacao, MovimentacaoInvalida, type TipoMovimentacao } from "../domain/movimentacao.ts";
import type { LinhaBicicleta, LinhaReserva, OperacoesOperacao, SessaoEquipe, TransacaoOperacao } from "./portas.ts";

// Retirada e devolução da bicicleta no balcão (rotas 26 e 27 de docs/contrato-api-mvp.md). O serviço
// coordena três classes, cada uma com a sua regra:
// - Reserva (módulo reservas): o status e a janela de horário, por iniciar() e concluir();
// - Bicicleta (módulo catalogo): se a unidade pode sair (estaDisponivel: só DISPONIVEL);
// - Movimentacao e Checklist (este módulo): o registro do atendimento, que só existe válido.
// Aqui ficam a ordem das travas (reserva, depois bicicleta), a regra de que a unidade precisa ter
// voltado da reserva anterior e a gravação, tudo na mesma transação.
//
// Reserva e Bicicleta chegam pelas dependências (montarReserva, montarBicicleta), e não por import:
// assim este arquivo não carrega os módulos inteiros (rotas, banco), e a suíte de banco roda só com
// o que precisa.

export const MENSAGEM_NAO_ENCONTRADA = "Reserva não encontrada.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SITUACAO_DA_UNIDADE: Record<string, string> = {
  MANUTENCAO: "em manutenção",
  BLOQUEADA: "bloqueada",
  BAIXADA: "fora da frota",
  ALUGADA: "alugada",
};

export type ReservaComBicicleta = ReservaDto & { bicicleta: { id: string; codigo: string } | null };

export type DependenciasOperacao = {
  transacao: TransacaoOperacao;
  agora: () => Date;
  // new Reserva(linha), da API pública do módulo reservas
  montarReserva: (linha: LinhaReserva) => Reserva;
  // new Bicicleta(linha), da API pública do módulo catalogo
  montarBicicleta: (linha: LinhaBicicleta) => Bicicleta;
};

// Lê o corpo só depois de conferir o id: id inválido é 404 mesmo com o corpo quebrado.
export type LeitorDoCorpo = () => Promise<unknown>;

type Passo = {
  de: "CONFIRMADA" | "EM_ANDAMENTO";
  para: "EM_ANDAMENTO" | "CONCLUIDA";
  nome: string;
};

const PASSOS: Record<TipoMovimentacao, Passo> = {
  RETIRADA: { de: "CONFIRMADA", para: "EM_ANDAMENTO", nome: "retirada" },
  DEVOLUCAO: { de: "EM_ANDAMENTO", para: "CONCLUIDA", nome: "devolução" },
};

export class OperacaoService {
  readonly #deps: DependenciasOperacao;

  constructor(deps: DependenciasOperacao) {
    this.#deps = deps;
  }

  /** POST /api/operacao/reservas/{id}/retirada (rota 26): CONFIRMADA -> EM_ANDAMENTO. */
  registrarRetirada(sessao: SessaoEquipe, id: unknown, lerCorpo: LeitorDoCorpo): Promise<ReservaComBicicleta> {
    return this.#registrar("RETIRADA", sessao, id, lerCorpo);
  }

  /** POST /api/operacao/reservas/{id}/devolucao (rota 27): EM_ANDAMENTO -> CONCLUIDA (vale com atraso). */
  registrarDevolucao(sessao: SessaoEquipe, id: unknown, lerCorpo: LeitorDoCorpo): Promise<ReservaComBicicleta> {
    return this.#registrar("DEVOLUCAO", sessao, id, lerCorpo);
  }

  async #registrar(
    tipo: TipoMovimentacao,
    sessao: SessaoEquipe,
    id: unknown,
    lerCorpo: LeitorDoCorpo,
  ): Promise<ReservaComBicicleta> {
    if (typeof id !== "string" || !UUID.test(id)) throw new NotFoundError(MENSAGEM_NAO_ENCONTRADA);
    const checklist = Checklist.deCorpo(await lerCorpo());
    const passo = PASSOS[tipo];

    return this.#deps.transacao(sessao, async (op) => {
      await op.expirarVencidas();
      const linha = await op.travarReserva(id);
      if (!linha) throw new NotFoundError(MENSAGEM_NAO_ENCONTRADA);
      const reserva = this.#deps.montarReserva(linha);
      const agora = this.#deps.agora();

      if (reserva.status !== passo.de) {
        throw new ConflictError(
          `A ${passo.nome} só vale para reserva ${passo.de === "CONFIRMADA" ? "confirmada" : "em andamento"}: esta está ${reserva.status}.`,
        );
      }
      if (tipo === "RETIRADA") {
        this.#iniciar(reserva, agora);
        await this.#garantirQueAUnidadePodeSair(op, reserva);
      } else {
        reserva.concluir();
      }

      const dados = { reservaId: reserva.id, operadorId: sessao.usuarioId, checklist, dataHora: agora };
      const movimentacao = tipo === "RETIRADA" ? Movimentacao.retirada(dados) : Movimentacao.devolucao(dados);
      await op.registrarMovimentacao(movimentacao.paraPersistir());
      if (!(await op.mudarStatus(reserva.id, passo.de, passo.para))) {
        throw new ConflictError(`A reserva mudou de status antes da ${passo.nome}. Atualize o painel.`);
      }
      return { ...reserva.paraDto(), bicicleta: await op.bicicletaDaReserva(reserva.id) };
    });
  }

  // O status já foi conferido (409); o que iniciar() ainda recusa é a janela de horário, e o
  // contrato manda 400 para ela.
  #iniciar(reserva: Reserva, agora: Date): void {
    try {
      reserva.iniciar(agora);
    } catch (erro) {
      if (erro instanceof ConflictError) throw new ValidationError(erro.message, { horario: erro.message });
      throw erro;
    }
  }

  // A unidade só sai se a Bicicleta disser que está disponível (não está em manutenção, bloqueada
  // ou fora da frota) e se ela já voltou da reserva anterior: o contrato aceita devolução com atraso,
  // então a reserva anterior pode continuar EM_ANDAMENTO depois do fim.
  async #garantirQueAUnidadePodeSair(op: OperacoesOperacao, reserva: Reserva): Promise<void> {
    const linha = await op.travarBicicletaDaReserva(reserva.id);
    if (!linha) throw new MovimentacaoInvalida("Esta reserva não tem bicicleta atribuída. Fale com o administrador.");
    const bicicleta = this.#deps.montarBicicleta(linha);
    if (!bicicleta.estaDisponivel(reserva.periodo)) {
      const situacao = SITUACAO_DA_UNIDADE[bicicleta.status] ?? "indisponível";
      throw new MovimentacaoInvalida(
        `A bicicleta ${bicicleta.codigo} está ${situacao} e não pode ser retirada. Fale com o administrador.`,
      );
    }
    const anterior = await op.outraReservaEmAndamento(bicicleta.id, reserva.id);
    if (anterior) {
      throw new MovimentacaoInvalida(
        `A bicicleta ${bicicleta.codigo} ainda não foi devolvida pela reserva ${anterior.codigo}. Registre a devolução antes.`,
      );
    }
  }
}
