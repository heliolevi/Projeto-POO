"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatarReais } from "@/shared/format/moeda-e-data";
import { ApiError, getAutenticado, postAutenticado } from "@/shared/http/api-cliente";
import {
  imagemDoQrCode,
  situacaoDoPix,
  type CobrancaPix,
  type StatusDoPagamento,
} from "@/shared/pagamentos/pagamento";
import pagamentoStyles from "@/shared/pagamentos/pagamento.module.css";
import {
  formatarContagem,
  segundosRestantes,
  type ReservaDetalhada,
} from "@/shared/reservas/reserva";
import styles from "@/shared/reservas/reservas.module.css";

const INTERVALO_DA_CONSULTA_MS = 3000;

type Estado =
  | { tipo: "carregando" }
  | { tipo: "erro"; mensagem: string; podeTentarDeNovo: boolean }
  | { tipo: "encerrado" }
  | { tipo: "pagoSemReserva" }
  | { tipo: "confirmado" }
  | { tipo: "pronto"; cobranca: CobrancaPix };

function mensagemDe(erro: unknown, padrao: string): string {
  return erro instanceof ApiError ? erro.message : padrao;
}

export default function PagamentoPixPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [agora, setAgora] = useState(() => new Date());
  const [copiado, setCopiado] = useState(false);
  const temporizadorDaCopia = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cria (ou reaproveita, a rota é idempotente) a cobrança Pix da reserva.
  useEffect(() => {
    let ativo = true;

    async function criarCobranca() {
      try {
        const cobranca = await postAutenticado<CobrancaPix>("/api/pagamentos", {
          reservaId: id,
          metodo: "PIX",
        });
        if (ativo) setEstado({ tipo: "pronto", cobranca });
      } catch (erro) {
        if (!ativo) return;
        if (erro instanceof ApiError && erro.code === "CONFLICT") {
          // 409 não quer dizer só "prazo terminou": a reserva também pode já estar paga.
          await decidirPelaReserva(erro);
          return;
        }
        setEstado({
          tipo: "erro",
          mensagem: mensagemDe(erro, "Não foi possível gerar o Pix agora. Tente novamente."),
          podeTentarDeNovo: true,
        });
      }
    }

    async function decidirPelaReserva(conflito: ApiError) {
      try {
        const reserva = await getAutenticado<ReservaDetalhada>(`/api/reservas/${id}`);
        if (!ativo) return;
        if (reserva.status === "CONFIRMADA" || reserva.status === "EM_ANDAMENTO") {
          router.replace(`/app/reservas/${id}`);
        } else if (reserva.status === "EXPIRADA" || reserva.status === "CANCELADA") {
          setEstado({ tipo: "encerrado" });
        } else {
          setEstado({ tipo: "erro", mensagem: conflito.message, podeTentarDeNovo: false });
        }
      } catch (erro) {
        if (!ativo) return;
        setEstado({
          tipo: "erro",
          mensagem: mensagemDe(erro, "Não foi possível conferir a reserva agora."),
          podeTentarDeNovo: true,
        });
      }
    }

    criarCobranca();
    return () => {
      ativo = false;
    };
  }, [id, router, tentativa]);

  const aguardando = estado.tipo === "pronto";

  // Enquanto o Pix está na tela: consulta o status a cada 3 s, sempre esperando a consulta
  // anterior terminar (se a API demorar, não empilha requisições).
  useEffect(() => {
    if (!aguardando) return;
    let ativo = true;
    let proxima: ReturnType<typeof setTimeout> | undefined;

    async function consultar() {
      try {
        const status = await getAutenticado<StatusDoPagamento>(`/api/pagamentos/${id}/status`);
        if (!ativo) return;
        const situacao = situacaoDoPix(status);
        if (situacao === "confirmado") return setEstado({ tipo: "confirmado" });
        if (situacao === "encerrado") return setEstado({ tipo: "encerrado" });
        if (situacao === "pago_sem_reserva") return setEstado({ tipo: "pagoSemReserva" });
      } catch (erro) {
        if (!ativo) return;
        if (erro instanceof ApiError) {
          // 401: o cliente da API já levou para o login. 403/404: não adianta insistir.
          if (erro.code === "UNAUTHORIZED") return;
          if (erro.code === "FORBIDDEN" || erro.code === "NOT_FOUND") {
            return setEstado({ tipo: "erro", mensagem: erro.message, podeTentarDeNovo: false });
          }
        }
        // Falha de rede passageira (ou erro do servidor): tenta de novo na próxima volta.
      }
      if (ativo) proxima = setTimeout(consultar, INTERVALO_DA_CONSULTA_MS);
    }

    proxima = setTimeout(consultar, INTERVALO_DA_CONSULTA_MS);
    const relogio = setInterval(() => setAgora(new Date()), 1000);
    return () => {
      ativo = false;
      clearTimeout(proxima);
      clearInterval(relogio);
    };
  }, [aguardando, id]);

  // Pagamento confirmado: mostra o aviso por um instante e abre a confirmação da reserva.
  useEffect(() => {
    if (estado.tipo !== "confirmado") return;
    const espera = setTimeout(() => router.replace(`/app/reservas/${id}`), 1800);
    return () => clearTimeout(espera);
  }, [estado.tipo, id, router]);

  useEffect(() => {
    return () => {
      if (temporizadorDaCopia.current) clearTimeout(temporizadorDaCopia.current);
    };
  }, []);

  async function copiar(codigo: string) {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      if (temporizadorDaCopia.current) clearTimeout(temporizadorDaCopia.current);
      temporizadorDaCopia.current = setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  function tentarDeNovo() {
    setEstado({ tipo: "carregando" });
    setTentativa((atual) => atual + 1);
  }

  const restante =
    estado.tipo === "pronto" ? segundosRestantes(estado.cobranca.pix.expiraEm, agora) : 0;

  return (
    <div>
      <Link href={`/app/reservas/${id}`} className={styles.voltar}>
        ← Voltar para a reserva
      </Link>

      <h2 className={styles.titulo}>Pagamento com Pix</h2>

      {estado.tipo === "carregando" && <p className={styles.vazio}>Gerando o seu Pix...</p>}

      {estado.tipo === "erro" && (
        <>
          <div className={styles.erro} role="alert">
            {estado.mensagem}
          </div>
          {estado.podeTentarDeNovo && (
            <button type="button" className={styles.botaoSecundario} onClick={tentarDeNovo}>
              Tentar de novo
            </button>
          )}
        </>
      )}

      {estado.tipo === "encerrado" && (
        <>
          <p className={styles.aviso}>
            Esta reserva não aceita mais pagamento: o prazo terminou ou ela foi cancelada. Você pode
            fazer uma nova reserva quando quiser.
          </p>
          {/* Provisório: quando a busca (T27) existir, este botão deve levar para ela. */}
          <Link href="/app/reservas" className={styles.botaoSecundario}>
            Ver minhas reservas
          </Link>
        </>
      )}

      {estado.tipo === "pagoSemReserva" && (
        <>
          <p className={styles.aviso} role="alert">
            Recebemos o seu pagamento, mas esta reserva já não está ativa (o prazo terminou ou ela
            foi cancelada). Procure a locadora para resolver, informando o código da reserva.
          </p>
          <Link href={`/app/reservas/${id}`} className={styles.botaoSecundario}>
            Ver a reserva
          </Link>
        </>
      )}

      {estado.tipo === "confirmado" && (
        <p className={pagamentoStyles.sucesso} role="status">
          Pagamento confirmado! Estamos abrindo a sua reserva...
        </p>
      )}

      {estado.tipo === "pronto" && (
        <>
          {restante > 0 ? (
            <>
              <p className={styles.subtitulo}>
                Escaneie o QR code ou use o Pix copia e cola no aplicativo do seu banco.
              </p>

              <div className={pagamentoStyles.qrBloco}>
                {/* QR vem da API em base64; next/image não ajuda com data URI. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={pagamentoStyles.qr}
                  src={imagemDoQrCode(estado.cobranca.pix.qrCodeBase64)}
                  alt="QR code do Pix"
                />
                <span className={pagamentoStyles.valor}>
                  {formatarReais(estado.cobranca.valorCentavos)}
                </span>
                <span className={pagamentoStyles.contagem}>
                  Este Pix vale por mais {formatarContagem(restante)}
                </span>
              </div>

              <label htmlFor="pix-copia-e-cola" className={styles.subtitulo}>
                Pix copia e cola
              </label>
              <textarea
                id="pix-copia-e-cola"
                className={pagamentoStyles.codigo}
                readOnly
                rows={4}
                value={estado.cobranca.pix.copiaECola}
              />

              <div className={styles.acoes} style={{ marginTop: "var(--space-12)" }}>
                <button
                  type="button"
                  className={styles.botaoSecundario}
                  onClick={() => copiar(estado.cobranca.pix.copiaECola)}
                >
                  {copiado ? "Código copiado!" : "Copiar código Pix"}
                </button>
              </div>

              <ol className={pagamentoStyles.passos} style={{ marginTop: "var(--space-20)" }}>
                <li>Abra o aplicativo do seu banco e escolha pagar com Pix.</li>
                <li>Escaneie o QR code ou cole o código copiado.</li>
                <li>Confirme o pagamento. Esta tela atualiza sozinha.</li>
              </ol>
            </>
          ) : (
            <>
              <p className={styles.aviso}>
                O prazo deste Pix terminou. Se você acabou de pagar, aguarde um instante: esta tela
                confere o pagamento sozinha. Caso contrário, volte para a reserva.
              </p>
              <Link href={`/app/reservas/${id}`} className={styles.botaoSecundario}>
                Voltar para a reserva
              </Link>
            </>
          )}
        </>
      )}
    </div>
  );
}
