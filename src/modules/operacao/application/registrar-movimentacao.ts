import type { Reserva, ReservaDto } from "@/modules/reservas";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/http/errors.ts";
import type { ItemDoChecklist, LinhaReserva, SessaoEquipe, TipoMovimentacao, TransacaoOperacao } from "./portas.ts";

// Retirada e devolução da bicicleta no balcão, com checklist (rotas 26 e 27 de
// docs/contrato-api-mvp.md). As regras são da classe Reserva, do módulo reservas: iniciar() confere
// a tabela TRANSICOES e a janela de horário (de 30 minutos antes do início até o fim), concluir()
// confere a transição. Aqui ficam a validação do checklist, a trava da reserva e a gravação da
// movimentação na mesma transação.
//
// A classe chega pelas dependências (montarReserva), e não por import: assim este arquivo não
// carrega o módulo reservas inteiro (rotas, banco), e a suíte de banco roda só com o que precisa.

export const MENSAGEM_NAO_ENCONTRADA = "Reserva não encontrada.";

// Limites do checklist: o painel manda 5 itens; a folga cobre um item a mais sem abrir espaço para
// abuso (o corpo inteiro já é limitado a 16 KiB).
export const MAXIMO_DE_ITENS = 20;
export const TAMANHO_MAXIMO_DO_NOME = 40;
export const TAMANHO_MAXIMO_DAS_OBSERVACOES = 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehUuid = (valor: unknown): valor is string => typeof valor === "string" && UUID.test(valor);

export type ChecklistValidado = { itens: ItemDoChecklist[]; observacoes: string | null };

// Corpo das rotas 26 e 27:
// { "checklist": { "itens": [ { "nome": "freios", "ok": true }, ... ], "observacoes": "..." } }
export function validarChecklist(corpo: unknown): ChecklistValidado {
  const ehObjeto = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  if (!ehObjeto(corpo)) throw new ValidationError("O corpo precisa ser um objeto JSON.");
  const checklist = corpo.checklist;
  if (!ehObjeto(checklist)) {
    throw new ValidationError("Dados inválidos.", { checklist: "Envie o checklist com a lista de itens." });
  }

  const erros: Record<string, string> = {};
  const itens: ItemDoChecklist[] = [];
  const brutos = checklist.itens;
  if (!Array.isArray(brutos) || brutos.length === 0 || brutos.length > MAXIMO_DE_ITENS) {
    erros.itens = `Envie de 1 a ${MAXIMO_DE_ITENS} itens no checklist.`;
  } else {
    const vistos = new Set<string>();
    brutos.forEach((item, i) => {
      const nome = ehObjeto(item) && typeof item.nome === "string" ? item.nome.trim() : "";
      if (!nome || nome.length > TAMANHO_MAXIMO_DO_NOME) {
        erros[`itens[${i}].nome`] = `Informe o nome do item (até ${TAMANHO_MAXIMO_DO_NOME} caracteres).`;
        return;
      }
      if (!ehObjeto(item) || typeof item.ok !== "boolean") {
        erros[`itens[${i}].ok`] = "Marque o item como ok (true) ou com problema (false).";
        return;
      }
      if (vistos.has(nome.toLowerCase())) {
        erros[`itens[${i}].nome`] = "Item repetido no checklist.";
        return;
      }
      vistos.add(nome.toLowerCase());
      itens.push({ nome, ok: item.ok });
    });
  }

  let observacoes: string | null = null;
  if (checklist.observacoes !== undefined && checklist.observacoes !== null) {
    if (typeof checklist.observacoes !== "string") {
      erros.observacoes = "As observações precisam ser texto.";
    } else if (checklist.observacoes.trim().length > TAMANHO_MAXIMO_DAS_OBSERVACOES) {
      erros.observacoes = `As observações podem ter até ${TAMANHO_MAXIMO_DAS_OBSERVACOES} caracteres.`;
    } else {
      observacoes = checklist.observacoes.trim() || null;
    }
  }

  if (Object.keys(erros).length > 0) throw new ValidationError("Checklist inválido.", erros);
  return { itens, observacoes };
}

export type ReservaComBicicleta = ReservaDto & { bicicleta: { id: string; codigo: string } | null };

export type DependenciasOperacao = {
  transacao: TransacaoOperacao;
  agora: () => Date;
  // new Reserva(linha), da API pública do módulo reservas
  montarReserva: (linha: LinhaReserva) => Reserva;
};

function criarMovimento(deps: DependenciasOperacao, tipo: TipoMovimentacao) {
  const de = tipo === "RETIRADA" ? "CONFIRMADA" : "EM_ANDAMENTO";
  const para = tipo === "RETIRADA" ? "EM_ANDAMENTO" : "CONCLUIDA";
  const nomeDoMovimento = tipo === "RETIRADA" ? "retirada" : "devolução";

  return async function registrar(sessao: SessaoEquipe, id: unknown, corpo: unknown): Promise<ReservaComBicicleta> {
    if (!ehUuid(id)) throw new NotFoundError(MENSAGEM_NAO_ENCONTRADA);
    const checklist = validarChecklist(corpo);

    return deps.transacao(sessao, async (op) => {
      await op.expirarVencidas();
      const linha = await op.travarReserva(id);
      if (!linha) throw new NotFoundError(MENSAGEM_NAO_ENCONTRADA);
      const reserva = deps.montarReserva(linha);
      const agora = deps.agora();

      if (reserva.status !== de) {
        throw new ConflictError(
          `A ${nomeDoMovimento} só vale para reserva ${de === "CONFIRMADA" ? "confirmada" : "em andamento"}: esta está ${reserva.status}.`,
        );
      }
      if (tipo === "RETIRADA") {
        try {
          reserva.iniciar(agora);
        } catch (erro) {
          // o status já foi conferido acima (409); o que iniciar() ainda recusa é a janela de
          // horário, e o contrato manda 400 para ela
          if (erro instanceof ConflictError) {
            throw new ValidationError(erro.message, { horario: erro.message });
          }
          throw erro;
        }
      } else {
        reserva.concluir();
      }

      await op.registrarMovimentacao({
        reservaId: reserva.id,
        operadorId: sessao.usuarioId,
        tipo,
        itens: checklist.itens,
        observacoes: checklist.observacoes,
      });
      if (!(await op.mudarStatus(reserva.id, de, para))) {
        throw new ConflictError(`A reserva mudou de status antes da ${nomeDoMovimento}. Atualize o painel.`);
      }
      return { ...reserva.paraDto(), bicicleta: await op.bicicletaDaReserva(reserva.id) };
    });
  };
}

// POST /api/operacao/reservas/{id}/retirada (rota 26): CONFIRMADA -> EM_ANDAMENTO.
export const criarRegistrarRetirada = (deps: DependenciasOperacao) => criarMovimento(deps, "RETIRADA");

// POST /api/operacao/reservas/{id}/devolucao (rota 27): EM_ANDAMENTO -> CONCLUIDA.
export const criarRegistrarDevolucao = (deps: DependenciasOperacao) => criarMovimento(deps, "DEVOLUCAO");
