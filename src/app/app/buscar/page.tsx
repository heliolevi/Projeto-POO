"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { ATIVIDADES, ehAtividade } from "@/shared/dominio/ciclista";
import { DESCRICAO_ATIVIDADE, ROTULO_ATIVIDADE } from "@/shared/dominio/ciclista-rotulos";
import { formatarPeriodo, formatarReais } from "@/shared/format/moeda-e-data";
import { ApiError, getAutenticado } from "@/shared/http/api-cliente";
import { horariosDoDia, proximosDias, retiradaEDevolucao } from "@/shared/busca/agenda";
import { BilheteDoPeriodo } from "@/shared/busca/BilheteDoPeriodo";
import {
  aderenciaDosPontos,
  DURACOES,
  montarConsulta,
  validarBusca,
  type ErrosBusca,
  type FormularioBusca,
  type RespostaRecomendacao,
} from "@/shared/busca/busca";
import styles from "@/shared/busca/Busca.module.css";
import { useRelogio } from "@/shared/busca/use-relogio";
import { fotoDoTipoPorId } from "@/shared/landing/fotos-dos-tipos";
import { LOCADORA } from "@/shared/landing/locadora";
import { useAtividadesPorTipo } from "@/shared/landing/use-fotos-dos-tipos";
import { perfilCompleto, type ContaLogada } from "@/shared/perfil/perfil-ciclista";
import { linkDaReserva } from "@/shared/reservas/nova-reserva";
import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Escolha, type OpcaoDeEscolha } from "@/shared/ui/Escolha";
import { FotoCapa } from "@/shared/ui/FotoCapa";

type Resultado =
  | { tipo: "inicial" }
  | { tipo: "buscando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "pronto"; resposta: RespostaRecomendacao };

const OPCOES_DURACAO: OpcaoDeEscolha[] = DURACOES.map((d) => ({ valor: d.valor, rotulo: d.rotulo }));

const HORA_PREFERIDA = "09:00";

function IconeCerto() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function BuscarPage() {
  const [form, setForm] = useState<FormularioBusca>({
    data: "",
    hora: HORA_PREFERIDA,
    duracao: "240",
    atividade: "",
  });
  const [erros, setErros] = useState<ErrosBusca>({});
  const [resultado, setResultado] = useState<Resultado>({ tipo: "inicial" });
  const [conta, setConta] = useState<ContaLogada | null>(null);
  const atividadesPorTipo = useAtividadesPorTipo();
  const agora = useRelogio();
  const resultadosRef = useRef<HTMLElement>(null);

  // A conta serve para lembrar a atividade do perfil e avisar quem ainda não o preencheu.
  useEffect(() => {
    let ativo = true;
    getAutenticado<ContaLogada>("/api/conta/me")
      .then((dados) => ativo && setConta(dados))
      .catch(() => {
        // Só uma ajuda: sem a conta, a busca segue normalmente.
      });
    return () => {
      ativo = false;
    };
  }, []);

  // Dia e horário efetivos: o que a pessoa escolheu, se ainda vale; senão o primeiro dia com
  // horário livre e as 9h (ou o primeiro horário do dia). Calculado a cada render, sem efeito.
  const dias = agora ? proximosDias(agora) : [];
  const horariosPorDia = new Map(dias.map((d) => [d.valor, agora ? horariosDoDia(d.valor, agora) : []]));
  const diaValido = (valor: string) => (horariosPorDia.get(valor)?.length ?? 0) > 0;
  const data = diaValido(form.data) ? form.data : (dias.find((d) => diaValido(d.valor))?.valor ?? "");
  const horarios = horariosPorDia.get(data) ?? [];
  const hora = horarios.includes(form.hora)
    ? form.hora
    : horarios.includes(HORA_PREFERIDA)
      ? HORA_PREFERIDA
      : (horarios[0] ?? "");
  const efetivo: FormularioBusca = { ...form, data, hora };
  const periodo = retiradaEDevolucao(data, hora, Number(form.duracao));
  const rotuloDuracao = DURACOES.find((d) => d.valor === form.duracao)?.rotulo ?? "";

  const atividadeDoPerfil = conta?.ciclista?.atividade;
  const perfilIncompleto = conta?.perfil === "CLIENTE" && !perfilCompleto(conta.ciclista);

  const opcoesDeDia: OpcaoDeEscolha[] = dias.map((d) => ({
    valor: d.valor,
    rotulo: `${d.dia} ${d.mes}`,
    rotuloAcessivel: `${d.destaque ? `${d.destaque}, ` : ""}${d.descricao}`,
    desabilitada: !diaValido(d.valor),
    conteudo: (
      <>
        {d.destaque ? (
          <span className={styles.diaDestaque}>{d.destaque}</span>
        ) : (
          <span className={styles.diaSemana}>{d.semana}</span>
        )}
        <span className={styles.diaNumero}>{d.dia}</span>
        <span className={styles.diaMes}>{d.mes}</span>
      </>
    ),
  }));

  const opcoesDeAtividade: OpcaoDeEscolha[] = [
    {
      valor: "",
      rotulo: "A do meu perfil",
      detalhe: ehAtividade(atividadeDoPerfil)
        ? `${ROTULO_ATIVIDADE[atividadeDoPerfil]}, como está no seu perfil.`
        : "Usa o que você marcou no perfil.",
    },
    ...ATIVIDADES.map((valor) => ({
      valor,
      rotulo: ROTULO_ATIVIDADE[valor],
      detalhe: DESCRICAO_ATIVIDADE[valor],
    })),
  ];

  function alterar(campo: keyof FormularioBusca, valor: string) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
    if (erros[campo]) setErros((atual) => ({ ...atual, [campo]: undefined }));
  }

  async function buscar(evento: FormEvent) {
    evento.preventDefault();
    const encontrados = validarBusca(efetivo, agora ?? new Date());
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    setResultado({ tipo: "buscando" });
    try {
      const resposta = await getAutenticado<RespostaRecomendacao>(
        `/api/recomendacao?${montarConsulta(efetivo)}`,
      );
      setResultado({ tipo: "pronto", resposta });
      // Leva os resultados para a vista: no celular o formulário ocupa a tela toda.
      requestAnimationFrame(() =>
        resultadosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    } catch (erro) {
      if (erro instanceof ApiError && erro.details) {
        const doServidor: ErrosBusca = {
          data: erro.details.inicio,
          duracao: erro.details.fim,
          atividade: erro.details.atividade,
        };
        // Com erro de campo conhecido, mostra só o erro no campo (sem o alerta genérico).
        if (Object.values(doServidor).some(Boolean)) {
          setErros(doServidor);
          setResultado({ tipo: "inicial" });
          return;
        }
      }
      setResultado({
        tipo: "erro",
        mensagem:
          erro instanceof ApiError
            ? erro.message
            : "Não foi possível buscar agora. Tente novamente em instantes.",
      });
    }
  }

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <h2 className={styles.titulo}>Buscar bicicleta</h2>
        <p className={styles.subtitulo}>
          Escolha quando retirar e para quê. As bicicletas livres aparecem da mais indicada para
          você até a menos.
        </p>
      </header>

      {perfilIncompleto && (
        <Alert variant="info" title="Seu perfil está incompleto">
          Com altura, experiência e atividade a recomendação acerta mais.{" "}
          <Link href="/app/perfil">Completar meu perfil</Link>
        </Alert>
      )}

      <form onSubmit={buscar} noValidate className={styles.formulario}>
        {agora ? (
          <Escolha
            legenda="Dia da retirada"
            formato="dia"
            opcoes={opcoesDeDia}
            valor={data}
            aoMudar={(valor) => alterar("data", valor)}
            erro={erros.data}
          />
        ) : (
          <div>
            <p className={styles.subtitulo}>Dia da retirada</p>
            <div className={styles.esqueletoDias} aria-hidden="true" />
          </div>
        )}

        {agora && horarios.length > 0 && (
          <Escolha
            legenda="Horário da retirada"
            complemento={`última retirada às ${horarios.at(-1)?.slice(0, 2)}h`}
            formato="chip"
            opcoes={horarios.map((h) => ({ valor: h, rotulo: h }))}
            valor={hora}
            aoMudar={(valor) => alterar("hora", valor)}
            erro={erros.hora}
          />
        )}

        {agora && horarios.length === 0 && (
          <p className={styles.semHorario} role="status">
            Nenhum horário livre para retirada nos próximos dias.
          </p>
        )}

        <Escolha
          legenda="Por quanto tempo"
          formato="chip"
          opcoes={OPCOES_DURACAO}
          valor={form.duracao}
          aoMudar={(valor) => alterar("duracao", valor)}
          erro={erros.duracao}
        />

        <Escolha
          legenda="Para quê"
          formato="cartao"
          opcoes={opcoesDeAtividade}
          valor={form.atividade}
          aoMudar={(valor) => alterar("atividade", valor)}
          erro={erros.atividade}
        />

        {periodo && (
          <BilheteDoPeriodo
            retirada={periodo.retirada}
            devolucao={periodo.devolucao}
            duracao={rotuloDuracao}
            ponto={LOCADORA.ponto.nome}
          />
        )}

        <Button
          type="submit"
          loading={resultado.tipo === "buscando"}
          loadingText="Procurando bicicletas livres..."
          disabled={!agora || !periodo}
        >
          Ver bicicletas livres
        </Button>
      </form>

      {resultado.tipo === "erro" && <Alert variant="erro">{resultado.mensagem}</Alert>}

      {resultado.tipo === "pronto" && (
        <section ref={resultadosRef} className={styles.resultados} aria-labelledby="resultados-titulo">
          <div>
            <h3 id="resultados-titulo" className={styles.resultadosTitulo}>
              {resultado.resposta.resultados.length === 0
                ? "Nenhuma bicicleta livre"
                : resultado.resposta.resultados.length === 1
                  ? "1 bicicleta livre"
                  : `${resultado.resposta.resultados.length} bicicletas livres`}
            </h3>
            <p className={styles.resultadosTexto}>
              {formatarPeriodo(resultado.resposta.periodo.inicio, resultado.resposta.periodo.fim)}
              {resultado.resposta.resultados.length > 1 && ", da mais indicada para a menos"}
            </p>
          </div>

          {resultado.resposta.resultados.length === 0 && (
            <EmptyState title="Todas reservadas nesse período">
              Tente outro horário, outro dia ou um tempo menor.
            </EmptyState>
          )}

          {resultado.resposta.resultados.length > 0 && (
            <ul className={styles.lista}>
              {resultado.resposta.resultados.map((item) => {
                const aderencia = aderenciaDosPontos(item.pontos);
                return (
                  <li key={item.tipoId}>
                    <article className={styles.resultado} aria-labelledby={`tipo-${item.tipoId}`}>
                      <FotoCapa
                        foto={fotoDoTipoPorId(atividadesPorTipo, item.tipoId)}
                        formato="cartao"
                        sizes="(min-width: 768px) 592px, 100vw"
                      >
                        <span
                          className={`${styles.aderencia} ${
                            aderencia.variant === "sucesso" ? "" : styles.aderenciaMedia
                          }`}
                        >
                          {aderencia.rotulo}
                        </span>
                      </FotoCapa>

                      <div className={styles.resultadoCorpo}>
                        <div className={styles.resultadoTopo}>
                          <div>
                            <h4 id={`tipo-${item.tipoId}`} className={styles.resultadoNome}>
                              {item.nome}
                            </h4>
                            {item.descricao && (
                              <p className={styles.resultadoDescricao}>{item.descricao}</p>
                            )}
                          </div>
                          <p className={styles.preco}>
                            <span className={styles.precoValor}>
                              {formatarReais(item.valorAluguelCentavos)}
                            </span>
                            <span className={styles.precoNota}>pelo período</span>
                          </p>
                        </div>

                        {item.motivos.length > 0 && (
                          <ul className={styles.motivos}>
                            {item.motivos.map((motivo) => (
                              <li key={motivo}>
                                <IconeCerto />
                                {motivo}
                              </li>
                            ))}
                          </ul>
                        )}

                        <p className={styles.meta}>
                          <span>Caução de {formatarReais(item.valorCaucaoCentavos)} no balcão</span>
                          <span>
                            {item.unidadesLivres === 1
                              ? "1 unidade livre"
                              : `${item.unidadesLivres} unidades livres`}
                          </span>
                        </p>

                        <Link
                          className={styles.reservar}
                          href={linkDaReserva({
                            tipoId: item.tipoId,
                            inicio: resultado.resposta.periodo.inicio,
                            fim: resultado.resposta.periodo.fim,
                          })}
                        >
                          Reservar esta bicicleta
                        </Link>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
