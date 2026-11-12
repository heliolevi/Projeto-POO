"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { ATIVIDADES } from "@/shared/dominio/ciclista";
import { ROTULO_ATIVIDADE } from "@/shared/dominio/ciclista-rotulos";
import { formatarPeriodo, formatarReais } from "@/shared/format/moeda-e-data";
import { ApiError, getAutenticado } from "@/shared/http/api-cliente";
import {
  aderenciaDosPontos,
  DURACOES,
  montarConsulta,
  validarBusca,
  type ErrosBusca,
  type FormularioBusca,
  type RespostaRecomendacao,
} from "@/shared/busca/busca";
import { perfilCompleto, type ContaLogada } from "@/shared/perfil/perfil-ciclista";
import styles from "@/shared/reservas/reservas.module.css";
import { Alert } from "@/shared/ui/Alert";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Select } from "@/shared/ui/Select";
import { CalendarIcon } from "@/shared/ui/icons";
import { TextField } from "@/shared/ui/TextField";

type Resultado =
  | { tipo: "inicial" }
  | { tipo: "buscando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "pronto"; resposta: RespostaRecomendacao };

const OPCOES_ATIVIDADE = ATIVIDADES.map((valor) => ({ valor, rotulo: ROTULO_ATIVIDADE[valor] }));
const OPCOES_DURACAO = DURACOES.map((d) => ({ valor: d.valor, rotulo: d.rotulo }));

export default function BuscarPage() {
  const [form, setForm] = useState<FormularioBusca>({
    data: "",
    hora: "09:00",
    duracao: "240",
    atividade: "",
  });
  const [erros, setErros] = useState<ErrosBusca>({});
  const [resultado, setResultado] = useState<Resultado>({ tipo: "inicial" });
  const [perfilIncompleto, setPerfilIncompleto] = useState(false);

  // Só para avisar quem ainda não preencheu o perfil: sem altura a busca não traz nada útil.
  useEffect(() => {
    let ativo = true;
    getAutenticado<ContaLogada>("/api/conta/me")
      .then((conta) => {
        if (ativo && conta.perfil === "CLIENTE") {
          setPerfilIncompleto(!perfilCompleto(conta.ciclista));
        }
      })
      .catch(() => {
        // O aviso é só uma ajuda; se falhar, a busca segue normalmente.
      });
    return () => {
      ativo = false;
    };
  }, []);

  function alterar(campo: keyof FormularioBusca, valor: string) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
    if (erros[campo]) setErros((atual) => ({ ...atual, [campo]: undefined }));
  }

  async function buscar(evento: FormEvent) {
    evento.preventDefault();
    const encontrados = validarBusca(form);
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    setResultado({ tipo: "buscando" });
    try {
      const resposta = await getAutenticado<RespostaRecomendacao>(
        `/api/recomendacao?${montarConsulta(form)}`,
      );
      setResultado({ tipo: "pronto", resposta });
    } catch (erro) {
      if (erro instanceof ApiError && erro.details) {
        setErros({
          data: erro.details.inicio,
          duracao: erro.details.fim,
          atividade: erro.details.atividade,
        });
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
    <div style={{ display: "grid", gap: "var(--space-16)" }}>
      <div>
        <h2 className={styles.titulo}>Buscar bicicleta</h2>
        <p className={styles.subtitulo}>
          Escolha quando e para quê. Mostramos primeiro as mais indicadas para você.
        </p>
      </div>

      {perfilIncompleto && (
        <Alert variant="info" title="Complete o seu perfil">
          Com altura, experiência e atividade as recomendações ficam bem mais certeiras.{" "}
          <Link href="/app/perfil">Abrir meu perfil</Link>
        </Alert>
      )}

      <Card>
        <form onSubmit={buscar} noValidate style={{ display: "grid", gap: "var(--space-16)" }}>
          <TextField
            label="Dia da retirada"
            icon={<CalendarIcon />}
            type="date"
            value={form.data}
            onChange={(e) => alterar("data", e.target.value)}
            error={erros.data}
          />
          <TextField
            label="Horário de início"
            icon={<CalendarIcon />}
            type="time"
            value={form.hora}
            onChange={(e) => alterar("hora", e.target.value)}
            error={erros.hora}
          />
          <Select
            label="Por quanto tempo"
            opcoes={OPCOES_DURACAO}
            value={form.duracao}
            onChange={(e) => alterar("duracao", e.target.value)}
            error={erros.duracao}
          />
          <Select
            label="Atividade"
            placeholder="Usar a do meu perfil"
            opcoes={OPCOES_ATIVIDADE}
            value={form.atividade}
            onChange={(e) => alterar("atividade", e.target.value)}
            error={erros.atividade}
          />
          <Button type="submit" loading={resultado.tipo === "buscando"} showArrow={false}>
            Buscar
          </Button>
        </form>
      </Card>

      {resultado.tipo === "erro" && <Alert variant="erro">{resultado.mensagem}</Alert>}

      {resultado.tipo === "pronto" && resultado.resposta.resultados.length === 0 && (
        <EmptyState title="Nenhuma bicicleta livre nesse período">
          Tente outro horário, outro dia ou uma duração diferente.
        </EmptyState>
      )}

      {resultado.tipo === "pronto" && resultado.resposta.resultados.length > 0 && (
        <section aria-label="Bicicletas recomendadas" style={{ display: "grid", gap: "var(--space-12)" }}>
          <p className={styles.subtitulo} style={{ margin: 0 }}>
            {formatarPeriodo(resultado.resposta.periodo.inicio, resultado.resposta.periodo.fim)}
          </p>
          <ul className={styles.lista}>
            {resultado.resposta.resultados.map((item) => {
              const aderencia = aderenciaDosPontos(item.pontos);
              return (
                <li key={item.tipoId}>
                  <Card
                    title={item.nome}
                    action={<Badge variant={aderencia.variant}>{aderencia.rotulo}</Badge>}
                    footer={
                      <div className={styles.acoes}>
                        {/* A tela de resumo e o POST /api/reservas entram na parte 2 da T38. */}
                        <button type="button" className={styles.botaoSecundario} disabled>
                          Reservar (em breve)
                        </button>
                      </div>
                    }
                  >
                    <p className={styles.linha}>{item.descricao}</p>
                    <ul style={{ margin: "var(--space-8) 0", paddingLeft: "var(--space-20)" }}>
                      {item.motivos.map((motivo) => (
                        <li key={motivo}>{motivo}</li>
                      ))}
                    </ul>
                    <p className={styles.linha}>
                      <strong>{formatarReais(item.valorAluguelCentavos)}</strong> pelo período ·
                      caução de {formatarReais(item.valorCaucaoCentavos)} no balcão
                    </p>
                    <p className={styles.linha}>
                      {item.unidadesLivres === 1
                        ? "1 unidade livre"
                        : `${item.unidadesLivres} unidades livres`}
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
