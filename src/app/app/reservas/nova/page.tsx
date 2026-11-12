"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { RespostaRecomendacao, Recomendacao } from "@/shared/busca/busca";
import { formatarDuracao, formatarPeriodo, formatarReais } from "@/shared/format/moeda-e-data";
import { ApiError, getAutenticado, postAutenticado } from "@/shared/http/api-cliente";
import {
  enderecoDoPonto,
  lerPedidoDaReserva,
  motivoDoErro,
  type Empresa,
  type PedidoDeReserva,
  type PontoDaEmpresa,
} from "@/shared/reservas/nova-reserva";
import type { Reserva } from "@/shared/reservas/reserva";
import styles from "@/shared/reservas/reservas.module.css";
import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";

type Estado =
  | { tipo: "carregando" }
  | { tipo: "invalido" }
  | { tipo: "indisponivel"; motivo: "conflito" | "ausente" }
  | { tipo: "erro"; mensagem: string; trocarHorario: boolean }
  | { tipo: "pronto"; item: Recomendacao; ponto: PontoDaEmpresa | null };

export default function NovaReservaPage() {
  return (
    <Suspense fallback={null}>
      <ResumoDaReserva />
    </Suspense>
  );
}

function ResumoDaReserva() {
  const router = useRouter();
  const parametros = useSearchParams();
  const pedido = lerPedidoDaReserva(parametros);
  const [estado, setEstado] = useState<Estado>({ tipo: pedido ? "carregando" : "invalido" });
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  const tipoId = pedido?.tipoId;
  const inicio = pedido?.inicio;
  const fim = pedido?.fim;

  // Confere se o tipo ainda está livre no período (e pega o preço que o servidor calcula).
  useEffect(() => {
    if (!tipoId || !inicio || !fim) return;
    let ativo = true;
    const consulta = new URLSearchParams({ inicio, fim }).toString();

    Promise.all([
      getAutenticado<RespostaRecomendacao>(`/api/recomendacao?${consulta}`),
      getAutenticado<Empresa>("/api/empresa").catch(() => null),
    ])
      .then(([recomendacao, empresa]) => {
        if (!ativo) return;
        const item = recomendacao.resultados.find((r) => r.tipoId === tipoId);
        setEstado(
          item
            ? { tipo: "pronto", item, ponto: empresa?.pontos[0] ?? null }
            : { tipo: "indisponivel", motivo: "ausente" },
        );
      })
      .catch((erro) => {
        if (!ativo) return;
        setEstado({
          tipo: "erro",
          mensagem:
            erro instanceof ApiError
              ? motivoDoErro(erro)
              : "Não foi possível montar o resumo agora. Tente novamente.",
          // Erro de campo (ex.: o início já passou): tentar de novo não resolve, só outro horário.
          trocarHorario: erro instanceof ApiError && Boolean(erro.details),
        });
      });
    return () => {
      ativo = false;
    };
  }, [tipoId, inicio, fim]);

  async function reservar(dados: PedidoDeReserva) {
    setEnviando(true);
    setErroEnvio(null);
    try {
      const reserva = await postAutenticado<Reserva>("/api/reservas", dados);
      // replace, não push: ao voltar do Pix, o resumo não reaparece com o botão ativo
      // (um segundo clique criaria outra reserva pendente).
      router.replace(`/app/reservas/${reserva.id}/pagamento`);
    } catch (erro) {
      if (erro instanceof ApiError && erro.code === "CONFLICT") {
        // Alguém reservou a última unidade enquanto o cliente olhava o resumo.
        setEstado({ tipo: "indisponivel", motivo: "conflito" });
      } else if (erro instanceof ApiError && erro.details) {
        // 400 com motivo de campo (ex.: o início já passou): mostra o motivo e oferece outro horário.
        setEstado({ tipo: "erro", mensagem: motivoDoErro(erro), trocarHorario: true });
      } else {
        setErroEnvio(
          erro instanceof ApiError
            ? erro.message
            : "Não foi possível reservar agora. Tente novamente em instantes.",
        );
      }
      setEnviando(false);
    }
  }

  const voltar = (
    <Link href="/app/buscar" className={styles.voltar}>
      ← Voltar para a busca
    </Link>
  );

  return (
    <div style={{ display: "grid", gap: "var(--space-16)" }}>
      {voltar}
      <h2 className={styles.titulo}>Resumo da reserva</h2>

      {estado.tipo === "carregando" && <p className={styles.vazio}>Montando o resumo...</p>}

      {estado.tipo === "invalido" && (
        <Alert variant="aviso">
          Não encontramos os dados dessa reserva. Volte para a busca e escolha a bicicleta de novo.
        </Alert>
      )}

      {estado.tipo === "indisponivel" && (
        <Alert
          variant="aviso"
          title={
            estado.motivo === "conflito"
              ? "Essa bicicleta acabou de ser reservada"
              : "Essa bicicleta não está mais disponível nesse período"
          }
          action={
            <Link href="/app/buscar" className={styles.botaoSecundario}>
              Escolher outra opção
            </Link>
          }
        >
          {estado.motivo === "conflito"
            ? "Outra pessoa foi mais rápida. Veja as demais bicicletas livres nesse período."
            : "Veja as demais bicicletas livres ou escolha outro horário."}
        </Alert>
      )}

      {estado.tipo === "erro" && (
        <Alert
          variant="erro"
          action={
            estado.trocarHorario ? (
              <Link href="/app/buscar" className={styles.botaoSecundario}>
                Escolher outro horário
              </Link>
            ) : undefined
          }
        >
          {estado.mensagem}
        </Alert>
      )}

      {estado.tipo === "pronto" && pedido && (
        <>
          <Card title={`Bicicleta ${estado.item.nome}`}>
            <dl className={styles.detalhes} style={{ border: "none", padding: 0, margin: 0 }}>
              <div>
                <dt>Período</dt>
                <dd>
                  {formatarPeriodo(pedido.inicio, pedido.fim)} (
                  {formatarDuracao(pedido.inicio, pedido.fim)})
                </dd>
              </div>
              {estado.ponto && (
                <div>
                  <dt>Retirada</dt>
                  <dd>
                    {estado.ponto.nome}
                    <br />
                    {enderecoDoPonto(estado.ponto)}
                  </dd>
                </div>
              )}
              <div>
                <dt>Aluguel (pago agora, por Pix)</dt>
                <dd>
                  <strong>{formatarReais(estado.item.valorAluguelCentavos)}</strong>
                </dd>
              </div>
              <div>
                <dt>Caução (combinada no balcão)</dt>
                <dd>{formatarReais(estado.item.valorCaucaoCentavos)}</dd>
              </div>
            </dl>
          </Card>

          <Alert variant="info" title="Como funciona">
            Ao reservar, a bicicleta fica separada para você por 15 minutos para o pagamento. Depois
            disso, a reserva expira. Se precisar cancelar uma reserva já paga, o estorno é combinado
            no balcão da locadora.
          </Alert>

          {erroEnvio && <Alert variant="erro">{erroEnvio}</Alert>}

          <Button type="button" loading={enviando} onClick={() => reservar(pedido)}>
            Reservar e pagar
          </Button>
        </>
      )}
    </div>
  );
}
