"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatarPeriodo, formatarReais } from "@/shared/format/moeda-e-data";
import { ApiError, getAutenticado, postAutenticado } from "@/shared/http/api-cliente";
import { podeCancelar, type Reserva, type ReservaDetalhada } from "@/shared/reservas/reserva";
import { ContagemRegressiva } from "@/shared/reservas/ContagemRegressiva";
import { SeloStatus } from "@/shared/reservas/SeloStatus";
import styles from "@/shared/reservas/reservas.module.css";

type Estado =
  | { tipo: "carregando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "pronto"; reserva: ReservaDetalhada };

const MENSAGEM_POR_STATUS: Partial<Record<Reserva["status"], string>> = {
  PENDENTE_PAGAMENTO:
    "Sua bicicleta está separada por alguns minutos. Conclua o pagamento para confirmar a reserva.",
  CONFIRMADA: "Reserva confirmada! É só apresentar o código no ponto de retirada.",
  EM_ANDAMENTO: "Bom passeio! Lembre-se de devolver a bicicleta no horário combinado.",
  CONCLUIDA: "Reserva concluída. Obrigado por pedalar com a gente!",
  CANCELADA: "Esta reserva foi cancelada.",
  EXPIRADA: "O prazo para pagar terminou e a bicicleta foi liberada. Você pode fazer uma nova reserva.",
};

function mensagemDeErro(erro: unknown, padrao: string): string {
  return erro instanceof ApiError ? erro.message : padrao;
}

export default function ReservaDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [cancelando, setCancelando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  // Prazo de pagamento acabou: busca a reserva de novo para mostrar o status atual (Expirada).
  const recarregar = useCallback(() => setVersao((atual) => atual + 1), []);

  useEffect(() => {
    let ativo = true;
    getAutenticado<ReservaDetalhada>(`/api/reservas/${id}`)
      .then((reserva) => ativo && setEstado({ tipo: "pronto", reserva }))
      .catch((erro) => {
        if (!ativo) return;
        setEstado({
          tipo: "erro",
          mensagem: mensagemDeErro(erro, "Não foi possível carregar a reserva agora."),
        });
      });
    return () => {
      ativo = false;
    };
  }, [id, versao]);

  async function cancelar() {
    if (estado.tipo !== "pronto") return;
    const aviso =
      estado.reserva.status === "CONFIRMADA"
        ? "Tem certeza de que deseja cancelar esta reserva? O estorno do pagamento não é automático: ele é combinado no balcão da locadora."
        : "Tem certeza de que deseja cancelar esta reserva?";
    if (!window.confirm(aviso)) return;

    setCancelando(true);
    setErroAcao(null);
    try {
      const atualizada = await postAutenticado<Reserva>(`/api/reservas/${id}/cancelar`);
      setEstado({ tipo: "pronto", reserva: { ...estado.reserva, ...atualizada } });
    } catch (erro) {
      setErroAcao(mensagemDeErro(erro, "Não foi possível cancelar agora. Tente novamente."));
    } finally {
      setCancelando(false);
    }
  }

  return (
    <div>
      <Link href="/app/reservas" className={styles.voltar}>
        ← Minhas reservas
      </Link>

      {estado.tipo === "carregando" && <p className={styles.vazio}>Carregando a reserva...</p>}

      {estado.tipo === "erro" && (
        <div className={styles.erro} role="alert">
          {estado.mensagem}
        </div>
      )}

      {estado.tipo === "pronto" && (
        <>
          <h2 className={styles.titulo}>Sua reserva</h2>
          <p className={styles.subtitulo}>
            <SeloStatus status={estado.reserva.status} />
          </p>

          <p className={styles.aviso}>
            {MENSAGEM_POR_STATUS[estado.reserva.status]}
            {estado.reserva.status === "PENDENTE_PAGAMENTO" && (
              <>
                <br />
                <strong>
                  <ContagemRegressiva expiraEm={estado.reserva.expiraEm} aoExpirar={recarregar} />
                </strong>
              </>
            )}
          </p>

          <dl className={styles.detalhes}>
            <div>
              <dt>Código da reserva</dt>
              <dd>{estado.reserva.codigo}</dd>
            </div>
            <div>
              <dt>Bicicleta</dt>
              <dd>{estado.reserva.tipo.nome}</dd>
            </div>
            <div>
              <dt>Período</dt>
              <dd>{formatarPeriodo(estado.reserva.periodo.inicio, estado.reserva.periodo.fim)}</dd>
            </div>
            <div>
              <dt>Retirada</dt>
              <dd>
                {estado.reserva.ponto.nome}
                <br />
                {estado.reserva.ponto.endereco}
              </dd>
            </div>
            <div>
              <dt>Aluguel</dt>
              <dd>{formatarReais(estado.reserva.valorAluguelCentavos)}</dd>
            </div>
            <div>
              <dt>Caução (combinada no balcão)</dt>
              <dd>{formatarReais(estado.reserva.valorCaucaoCentavos)}</dd>
            </div>
          </dl>

          {erroAcao && (
            <div className={styles.erro} role="alert">
              {erroAcao}
            </div>
          )}

          <div className={styles.acoes}>
            {podeCancelar(estado.reserva.status) && (
              <button
                type="button"
                className={styles.botaoSecundario}
                onClick={cancelar}
                disabled={cancelando}
              >
                {cancelando ? "Cancelando..." : "Cancelar reserva"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
