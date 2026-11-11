"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatarReais } from "@/shared/format/moeda-e-data";
import { ApiError, getAutenticado, postAutenticado } from "@/shared/http/api-cliente";
import {
  imagemDoQrCode,
  situacaoDoPix,
  type CobrancaPix,
  type StatusDoPagamento,
} from "@/shared/pagamentos/pagamento";
import pagamentoStyles from "@/shared/pagamentos/pagamento.module.css";
import { formatarContagem, segundosRestantes } from "@/shared/reservas/reserva";
import styles from "@/shared/reservas/reservas.module.css";

const INTERVALO_DA_CONSULTA_MS = 3000;

type Estado =
  | { tipo: "carregando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "encerrado" }
  | { tipo: "confirmado" }
  | { tipo: "pronto"; cobranca: CobrancaPix };

export default function PagamentoPixPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [agora, setAgora] = useState(() => new Date());
  const [copiado, setCopiado] = useState(false);

  // Cria (ou reaproveita, a rota é idempotente) a cobrança Pix da reserva.
  useEffect(() => {
    let ativo = true;
    postAutenticado<CobrancaPix>("/api/pagamentos", { reservaId: id, metodo: "PIX" })
      .then((cobranca) => ativo && setEstado({ tipo: "pronto", cobranca }))
      .catch((erro) => {
        if (!ativo) return;
        if (erro instanceof ApiError && erro.code === "CONFLICT") {
          setEstado({ tipo: "encerrado" });
          return;
        }
        setEstado({
          tipo: "erro",
          mensagem:
            erro instanceof ApiError
              ? erro.message
              : "Não foi possível gerar o Pix agora. Tente novamente em instantes.",
        });
      });
    return () => {
      ativo = false;
    };
  }, [id]);

  const aguardando = estado.tipo === "pronto";

  // Enquanto o Pix está na tela: consulta o status a cada 3 s e atualiza a contagem.
  useEffect(() => {
    if (!aguardando) return;
    let ativo = true;

    async function consultar() {
      try {
        const status = await getAutenticado<StatusDoPagamento>(`/api/pagamentos/${id}/status`);
        if (!ativo) return;
        const situacao = situacaoDoPix(status);
        if (situacao === "confirmado") setEstado({ tipo: "confirmado" });
        else if (situacao === "encerrado") setEstado({ tipo: "encerrado" });
      } catch {
        // Falha de rede passageira: tenta de novo na próxima volta.
      }
    }

    const consulta = setInterval(consultar, INTERVALO_DA_CONSULTA_MS);
    const relogio = setInterval(() => setAgora(new Date()), 1000);
    return () => {
      ativo = false;
      clearInterval(consulta);
      clearInterval(relogio);
    };
  }, [aguardando, id]);

  // Pagamento confirmado: mostra o aviso por um instante e abre a confirmação da reserva.
  useEffect(() => {
    if (estado.tipo !== "confirmado") return;
    const espera = setTimeout(() => router.replace(`/app/reservas/${id}`), 1800);
    return () => clearTimeout(espera);
  }, [estado.tipo, id, router]);

  async function copiar(codigo: string) {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
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
        <div className={styles.erro} role="alert">
          {estado.mensagem}
        </div>
      )}

      {estado.tipo === "encerrado" && (
        <>
          <p className={styles.aviso}>
            Esta reserva não aceita mais pagamento: o prazo terminou ou ela foi cancelada. Você pode
            fazer uma nova reserva quando quiser.
          </p>
          <Link href="/app/reservas" className={styles.botaoSecundario}>
            Ver minhas reservas
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
              {restante > 0
                ? `Este Pix vale por mais ${formatarContagem(restante)}`
                : "O prazo deste Pix terminou"}
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
      )}
    </div>
  );
}
