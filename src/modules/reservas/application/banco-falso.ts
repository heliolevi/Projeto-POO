// SÓ PARA TESTES. Banco em memória que imita o que importa do PostgreSQL para a reserva: a
// exclusion constraint (23P01), o código único (23505), a RLS (reserva de outro cliente é
// invisível) e o ROLLBACK da transação quando o caso de uso falha.
import { CodigoRepetido, SobreposicaoDePeriodo } from "../domain/erros.ts";
import { PRAZO_PAGAMENTO_MS, type StatusReserva } from "../domain/reserva.ts";
import type {
  LinhaReserva,
  OperacoesReservas,
  ReservaParaGravar,
  SessaoCliente,
  TipoReservavel,
  Transacao,
} from "./portas.ts";

export type Unidade = { id: string; tipoId: string; pontoId: string; codigo: string; status: string };
type Registro = LinhaReserva & { clienteId: string; bicicletaId: string };

const ATIVAS: StatusReserva[] = ["PENDENTE_PAGAMENTO", "CONFIRMADA", "EM_ANDAMENTO"];

export function criarBancoFalso(agora: () => Date) {
  const tipos = new Map<string, TipoReservavel & { ativo: boolean }>();
  const unidades: Unidade[] = [];
  let reservas: Registro[] = [];
  const log: string[] = [];
  const estado = {
    // unidades que a escolha oferece mesmo ocupadas: imita a corrida (outra transação gravou
    // entre a consulta e o INSERT), que só a exclusion constraint pega
    escolheIgnorandoReservas: false,
    codigosOcupados: new Set<string>(),
  };
  const ponto = { id: "ponto-1", nome: "Ponto Litorânea", endereco: "Av. Litorânea, 100, Calhau" };

  function sobrepoe(r: { inicio: Date; fim: Date }, inicio: Date, fim: Date) {
    return r.inicio < fim && inicio < r.fim;
  }

  // desfaz, na ordem inversa, o que UMA transação gravou (o ROLLBACK não pode apagar o que outra
  // transação confirmou nesse meio tempo)
  function operacoes(sessao: SessaoCliente, desfazer: (() => void)[]): OperacoesReservas {
    const minhas = () => reservas.filter((r) => r.clienteId === sessao.usuarioId);
    // o que a view devolve: sem o dono e sem a unidade
    const semInterno = (r: Registro): LinhaReserva => {
      const copia: Partial<Registro> = { ...r };
      delete copia.clienteId;
      delete copia.bicicletaId;
      return copia as LinhaReserva;
    };
    return {
      async expirarVencidas() {
        log.push("expirarVencidas");
        for (const r of reservas) {
          if (
            r.status === "PENDENTE_PAGAMENTO" &&
            r.criadoEm.getTime() <= agora().getTime() - PRAZO_PAGAMENTO_MS
          ) {
            const anterior = r.status;
            r.status = "EXPIRADA";
            desfazer.push(() => {
              r.status = anterior;
            });
          }
        }
      },
      async buscarTipo(tipoId) {
        log.push("buscarTipo");
        const t = tipos.get(tipoId);
        return t && t.ativo ? t : null;
      },
      async escolherUnidade(tipoId, inicio, fim, excluir) {
        log.push("escolherUnidade");
        const livre = unidades
          .filter((u) => u.tipoId === tipoId && u.status === "DISPONIVEL" && !excluir.includes(u.id))
          .sort((a, b) => a.codigo.localeCompare(b.codigo))
          .find(
            (u) =>
              estado.escolheIgnorandoReservas ||
              !reservas.some(
                (r) => r.bicicletaId === u.id && ATIVAS.includes(r.status) && sobrepoe(r, inicio, fim),
              ),
          );
        return livre ? { bicicletaId: livre.id, pontoId: livre.pontoId } : null;
      },
      async inserir(nova: ReservaParaGravar) {
        log.push("inserir");
        if (
          reservas.some(
            (r) =>
              r.bicicletaId === nova.bicicletaId &&
              ATIVAS.includes(r.status) &&
              sobrepoe(r, nova.inicio, nova.fim),
          )
        ) {
          throw new SobreposicaoDePeriodo();
        }
        if (estado.codigosOcupados.has(nova.codigo) || reservas.some((r) => r.codigo === nova.codigo)) {
          throw new CodigoRepetido();
        }
        const tipo = tipos.get(unidades.find((u) => u.id === nova.bicicletaId)!.tipoId)!;
        const registro: Registro = {
          id: `reserva-${reservas.length + 1}`,
          codigo: nova.codigo,
          status: "PENDENTE_PAGAMENTO",
          tipoId: tipo.id,
          tipoNome: tipo.nome,
          pontoId: ponto.id,
          pontoNome: ponto.nome,
          pontoEndereco: ponto.endereco,
          inicio: nova.inicio,
          fim: nova.fim,
          valorAluguelCentavos: nova.valorAluguelCentavos,
          valorCaucaoCentavos: nova.valorCaucaoCentavos,
          criadoEm: agora(),
          pagamentoStatus: null,
          pagamentoMetodo: null,
          clienteId: nova.clienteId,
          bicicletaId: nova.bicicletaId,
        };
        reservas.push(registro);
        desfazer.push(() => {
          reservas = reservas.filter((x) => x !== registro);
        });
        return semInterno(registro);
      },
      async listar(status) {
        log.push("listar");
        return minhas()
          .filter((r) => status === null || r.status === status)
          .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
          .map(semInterno);
      },
      async buscar(id) {
        log.push("buscar");
        const r = minhas().find((x) => x.id === id);
        return r ? semInterno(r) : null;
      },
      async travarStatus(id) {
        log.push("travarStatus");
        return minhas().find((x) => x.id === id)?.status ?? null;
      },
      async marcarCancelada(id) {
        log.push("marcarCancelada");
        const r = minhas().find((x) => x.id === id);
        if (!r) return;
        const anterior = r.status;
        r.status = "CANCELADA";
        desfazer.push(() => {
          r.status = anterior;
        });
      },
    };
  }

  // como o comSessao: se o caso de uso lançar, tudo o que ele gravou é desfeito
  const transacao: Transacao = async (sessao, fn) => {
    log.push("BEGIN");
    const desfazer: (() => void)[] = [];
    try {
      const resultado = await fn(operacoes(sessao, desfazer));
      log.push("COMMIT");
      return resultado;
    } catch (erro) {
      for (const passo of desfazer.reverse()) passo();
      log.push("ROLLBACK");
      throw erro;
    }
  };

  return {
    transacao,
    log,
    estado,
    unidades,
    ponto,
    todasAsReservas: () => reservas,
    adicionarTipo(tipo: TipoReservavel & { ativo?: boolean }) {
      tipos.set(tipo.id, { ativo: true, ...tipo });
    },
    adicionarUnidade(u: Partial<Unidade> & Pick<Unidade, "id" | "tipoId">) {
      unidades.push({ pontoId: ponto.id, codigo: u.id, status: "DISPONIVEL", ...u });
    },
    // reserva já existente (de qualquer cliente), direto no "banco"
    semear(r: Partial<Registro> & Pick<Registro, "id" | "clienteId" | "bicicletaId">) {
      reservas.push({
        codigo: `BIC-SEMEAR${r.id}`,
        status: "CONFIRMADA",
        tipoId: "tipo-urbana",
        tipoNome: "Urbana",
        pontoId: ponto.id,
        pontoNome: ponto.nome,
        pontoEndereco: ponto.endereco,
        inicio: new Date("2026-11-14T12:00:00.000Z"),
        fim: new Date("2026-11-14T16:00:00.000Z"),
        valorAluguelCentavos: 4000,
        valorCaucaoCentavos: 15000,
        criadoEm: agora(),
        pagamentoStatus: null,
        pagamentoMetodo: null,
        ...r,
      });
    },
  };
}
