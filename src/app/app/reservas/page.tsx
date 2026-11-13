"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatarPeriodo, formatarReais } from "@/shared/format/moeda-e-data";
import { ApiError, getAutenticado } from "@/shared/http/api-cliente";
import type { Reserva } from "@/shared/reservas/reserva";
import { ContagemRegressiva } from "@/shared/reservas/ContagemRegressiva";
import { SeloStatus } from "@/shared/reservas/SeloStatus";
import styles from "@/shared/reservas/reservas.module.css";
import { Alert } from "@/shared/ui/Alert";
import { EmptyState } from "@/shared/ui/EmptyState";

type Estado =
  | { tipo: "carregando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "pronto"; reservas: Reserva[] };

export default function MinhasReservasPage() {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });

  useEffect(() => {
    let ativo = true;
    getAutenticado<Reserva[]>("/api/reservas")
      .then((reservas) => ativo && setEstado({ tipo: "pronto", reservas }))
      .catch((erro) => {
        if (!ativo) return;
        const mensagem =
          erro instanceof ApiError
            ? erro.message
            : "Não foi possível carregar suas reservas agora. Tente novamente.";
        setEstado({ tipo: "erro", mensagem });
      });
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <div>
      <h2 className={styles.titulo}>Minhas reservas</h2>
      <p className={styles.subtitulo}>Acompanhe o que você já reservou.</p>

      {estado.tipo === "carregando" && <p className={styles.vazio} role="status">Carregando suas reservas...</p>}

      {estado.tipo === "erro" && (
        <Alert variant="erro">{estado.mensagem}</Alert>
      )}

      {estado.tipo === "pronto" && estado.reservas.length === 0 && (
        <EmptyState
          title="Você ainda não tem reservas"
          action={
            <Link href="/app/buscar" className={styles.botaoPrimario}>
              Buscar uma bicicleta
            </Link>
          }
        >
          Quando você reservar, ela aparece aqui.
        </EmptyState>
      )}

      {estado.tipo === "pronto" && estado.reservas.length > 0 && (
        <ul className={styles.lista}>
          {estado.reservas.map((reserva) => (
            <li key={reserva.id}>
              <Link href={`/app/reservas/${reserva.id}`} className={styles.cartao}>
                <div className={styles.cartaoTopo}>
                  <span className={styles.cartaoTitulo}>Bicicleta {reserva.tipo.nome}</span>
                  <SeloStatus status={reserva.status} />
                </div>
                <p className={styles.linha}>
                  {formatarPeriodo(reserva.periodo.inicio, reserva.periodo.fim)}
                </p>
                <p className={styles.linha}>{reserva.ponto.nome}</p>
                <p className={styles.linha}>{formatarReais(reserva.valorAluguelCentavos)}</p>
                {reserva.status === "PENDENTE_PAGAMENTO" && (
                  <p className={styles.linha}>
                    <strong>
                      <ContagemRegressiva expiraEm={reserva.expiraEm} />
                    </strong>
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
