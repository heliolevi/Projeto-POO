"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSessao } from "@/shared/auth/use-sessao";
import { formatarPeriodo } from "@/shared/format/moeda-e-data";
import { ApiError, getAutenticado, postAutenticado } from "@/shared/http/api-cliente";
import {
  ITENS_CHECKLIST,
  andamentoDeOutrosDias,
  ROTULO_ITEM,
  dataEmSaoLuis,
  faltaObservacao,
  montarChecklist,
  movimentoPossivel,
  ordenarParaOBalcao,
  type ItemChecklist,
  type Movimento,
  type ReservaDoPainel,
} from "@/shared/operacao/operacao";
import { SeloStatus } from "@/shared/reservas/SeloStatus";
import styles from "@/shared/reservas/reservas.module.css";
import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Modal } from "@/shared/ui/Modal";

// Painel de operação (B19): reservas do dia e registro de retirada e devolução com checklist.
// Rotas 25 a 27 de docs/contrato-api-mvp.md. Só OPERADOR e ADMIN.
export default function OperacaoPage() {
  const { sessao } = useSessao();
  if (!sessao) return null;
  if (sessao.perfil === "CLIENTE") {
    return (
      <EmptyState title="Área da equipe" as="h2" action={<Link href="/app/buscar">Buscar bicicleta</Link>}>
        Só a equipe da locadora registra retiradas e devoluções.
      </EmptyState>
    );
  }
  return <PainelDeOperacao />;
}

type Estado =
  | { tipo: "carregando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "pronto"; reservas: ReservaDoPainel[]; outrosDias: ReservaDoPainel[] };

const TITULO: Record<Movimento, string> = { retirada: "Registrar retirada", devolucao: "Registrar devolução" };

function PainelDeOperacao() {
  const [data, setData] = useState(() => dataEmSaoLuis());
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [aviso, setAviso] = useState<string | null>(null);
  const [emRegistro, setEmRegistro] = useState<{ reserva: ReservaDoPainel; movimento: Movimento } | null>(null);

  // Só a resposta do último pedido vale: trocar o dia duas vezes seguidas não deixa a lista
  // de um dia aparecer sob a data de outro.
  const ultimoPedido = useRef(0);

  const carregar = useCallback(async (dia: string) => {
    const pedido = ++ultimoPedido.current;
    setEstado({ tipo: "carregando" });
    try {
      const [doDia, emAndamento] = await Promise.all([
        getAutenticado<ReservaDoPainel[]>(`/api/admin/reservas?${new URLSearchParams({ data: dia })}`),
        // Devoluções de aluguéis que começaram em outro dia (rota 25 aceita `status`).
        getAutenticado<ReservaDoPainel[]>("/api/admin/reservas?status=EM_ANDAMENTO"),
      ]);
      if (pedido !== ultimoPedido.current) return;
      setEstado({
        tipo: "pronto",
        reservas: ordenarParaOBalcao(doDia),
        outrosDias: andamentoDeOutrosDias(doDia, emAndamento),
      });
    } catch (e) {
      if (pedido !== ultimoPedido.current) return;
      setEstado({
        tipo: "erro",
        mensagem:
          e instanceof ApiError && e.code === "NOT_FOUND"
            ? "O painel de operação ainda não está disponível no servidor."
            : e instanceof ApiError
              ? e.message
              : "Não foi possível carregar as reservas agora. Tente de novo.",
      });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga ao trocar o dia
    void carregar(data);
  }, [carregar, data]);

  function abrirRegistro(reserva: ReservaDoPainel, movimento: Movimento) {
    setAviso(null);
    setEmRegistro({ reserva, movimento });
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-16)" }}>
      <div>
        <h2 className={styles.titulo}>Operação</h2>
        <p className={styles.subtitulo}>Reservas do dia, retirada e devolução no balcão.</p>
      </div>

      <label style={{ display: "grid", gap: "var(--space-4)", maxWidth: 220 }}>
        Dia
        <input type="date" value={data} onChange={(e) => e.target.value && setData(e.target.value)} />
      </label>

      {aviso && <Alert variant="sucesso">{aviso}</Alert>}

      {estado.tipo === "carregando" && <p role="status" className={styles.vazio}>Carregando reservas...</p>}

      {estado.tipo === "erro" && (
        <Alert
          variant="erro"
          action={
            <button type="button" onClick={() => void carregar(data)}>
              Tentar de novo
            </button>
          }
        >
          {estado.mensagem}
        </Alert>
      )}

      {estado.tipo === "pronto" && estado.outrosDias.length > 0 && (
        <section aria-label="Em andamento de outros dias" style={{ display: "grid", gap: "var(--space-8)" }}>
          <h3 className={styles.cartaoTitulo}>Em andamento (retiradas de outros dias)</h3>
          <ListaDoBalcao reservas={estado.outrosDias} onRegistrar={abrirRegistro} />
        </section>
      )}

      {estado.tipo === "pronto" && estado.reservas.length === 0 && (
        <EmptyState title="Nenhuma reserva começa neste dia">Escolha outro dia para ver as reservas.</EmptyState>
      )}

      {estado.tipo === "pronto" && estado.reservas.length > 0 && (
        <ListaDoBalcao reservas={estado.reservas} onRegistrar={abrirRegistro} />
      )}

      {emRegistro && (
        <RegistroDeMovimento
          reserva={emRegistro.reserva}
          movimento={emRegistro.movimento}
          onFechar={() => setEmRegistro(null)}
          onRegistrado={async (texto) => {
            setEmRegistro(null);
            setAviso(texto);
            await carregar(data);
          }}
        />
      )}
    </div>
  );
}

function ListaDoBalcao({
  reservas,
  onRegistrar,
}: {
  reservas: ReservaDoPainel[];
  onRegistrar: (reserva: ReservaDoPainel, movimento: Movimento) => void;
}) {
  return (
    <ul className={styles.lista}>
      {reservas.map((reserva) => {
        const movimento = movimentoPossivel(reserva.status);
        return (
          <li key={reserva.id} className={styles.cartao}>
            <div className={styles.cartaoTopo}>
              <span className={styles.cartaoTitulo}>{reserva.cliente.nome}</span>
              <SeloStatus status={reserva.status} />
            </div>
            <p className={styles.linha}>
              {reserva.tipo.nome}
              {reserva.bicicleta ? ` · ${reserva.bicicleta.codigo}` : ""} · reserva {reserva.codigo}
            </p>
            <p className={styles.linha}>{formatarPeriodo(reserva.periodo.inicio, reserva.periodo.fim)}</p>
            {movimento && (
              <div style={{ marginTop: "var(--space-8)" }}>
                <Button type="button" showArrow={false} onClick={() => onRegistrar(reserva, movimento)}>
                  {TITULO[movimento]}
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RegistroDeMovimento({
  reserva,
  movimento,
  onFechar,
  onRegistrado,
}: {
  reserva: ReservaDoPainel;
  movimento: Movimento;
  onFechar: () => void;
  onRegistrado: (aviso: string) => Promise<void>;
}) {
  const [marcados, setMarcados] = useState<Partial<Record<ItemChecklist, boolean>>>({});
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function registrar() {
    const corpo = montarChecklist(marcados, observacoes);
    if (faltaObservacao(corpo)) {
      setErro("Algum item está com problema: descreva nas observações.");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      await postAutenticado(`/api/operacao/reservas/${reserva.id}/${movimento}`, corpo);
      await onRegistrado(
        movimento === "retirada"
          ? `Retirada de ${reserva.cliente.nome} registrada.`
          : `Devolução de ${reserva.cliente.nome} registrada. Reserva concluída.`,
      );
    } catch (e) {
      setErro(
        e instanceof ApiError && e.code === "CONFLICT"
          ? "Essa reserva já mudou de situação. Feche e confira a lista."
          : e instanceof ApiError
            ? e.message
            : "Não foi possível registrar agora. Tente de novo.",
      );
      setEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      // Durante o envio, Esc e clique no fundo não fecham: o pedido ainda está a caminho.
      onFechar={() => {
        if (!enviando) onFechar();
      }}
      titulo={`${TITULO[movimento]}: ${reserva.cliente.nome}`}
      rodape={
        <Button type="button" loading={enviando} loadingText="Registrando..." onClick={() => void registrar()}>
          Confirmar
        </Button>
      }
    >
      <div style={{ display: "grid", gap: "var(--space-12)" }}>
        <p>
          {reserva.tipo.nome}
          {reserva.bicicleta ? ` · ${reserva.bicicleta.codigo}` : ""}. Marque o que está em ordem.
        </p>
        <fieldset style={{ border: "none", padding: 0, display: "grid", gap: "var(--space-8)" }}>
          <legend>Checklist</legend>
          {ITENS_CHECKLIST.map((item) => (
            <label key={item} style={{ display: "flex", gap: "var(--space-8)", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={marcados[item] === true}
                onChange={(e) => setMarcados((m) => ({ ...m, [item]: e.target.checked }))}
              />
              {ROTULO_ITEM[item]}
            </label>
          ))}
        </fieldset>
        <label style={{ display: "grid", gap: "var(--space-4)" }}>
          Observações
          <textarea rows={3} maxLength={500} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </label>
        {erro && <Alert variant="erro">{erro}</Alert>}
      </div>
    </Modal>
  );
}
