"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useGuardaRota } from "@/shared/auth/guarda-rota";
import {
  ATIVIDADES,
  ROTULO_ATIVIDADE,
  ROTULO_STATUS,
  STATUS_EDITAVEIS,
  pontosDasBicicletas,
  reaisParaCentavos,
  type Atividade,
  type BicicletaAdmin,
  type StatusBicicleta,
  type TipoAdmin,
} from "@/shared/admin/catalogo";
import { formatarReais } from "@/shared/format/moeda-e-data";
import {
  ApiError,
  getAutenticado,
  patchAutenticado,
  postAutenticado,
  putAutenticado,
  type ErrosPorCampo,
} from "@/shared/http/api-cliente";
import { Alert } from "@/shared/ui/Alert";
import { AppShell } from "@/shared/ui/AppShell";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Select } from "@/shared/ui/Select";
import { Table } from "@/shared/ui/Table";
import { TextField } from "@/shared/ui/TextField";
import { IdCardIcon, SearchIcon } from "@/shared/ui/icons";

// Painel do catálogo (B11): só ADMIN. A API responde 403 para os outros perfis, e a tela
// nem chega a chamar a API para eles.
export default function AdminPage() {
  const { sessao } = useGuardaRota();
  if (!sessao) return null;

  return (
    <AppShell perfil={sessao.perfil}>
      {sessao.perfil === "ADMIN" ? (
        <PainelCatalogo />
      ) : (
        <EmptyState
          title="Área do administrador"
          as="h2"
          action={<Link href="/app">Voltar ao início</Link>}
        >
          Só o administrador gerencia o catálogo.
        </EmptyState>
      )}
    </AppShell>
  );
}

type Dados = { tipos: TipoAdmin[]; bicicletas: BicicletaAdmin[] };

function mensagem(erro: unknown, padrao: string): string {
  return erro instanceof ApiError ? erro.message : padrao;
}

function PainelCatalogo() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [tipos, bicicletas] = await Promise.all([
        getAutenticado<TipoAdmin[]>("/api/admin/tipos"),
        getAutenticado<BicicletaAdmin[]>("/api/admin/bicicletas"),
      ]);
      setDados({ tipos, bicicletas });
      setErro(null);
    } catch (e) {
      setErro(mensagem(e, "Não foi possível carregar o catálogo agora. Tente de novo."));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    void carregar();
  }, [carregar]);

  async function alternarAtivo(tipo: TipoAdmin) {
    try {
      await putAutenticado(`/api/admin/tipos/${tipo.id}`, {
        nome: tipo.nome,
        atividades: tipo.atividades,
        alturaMinCm: tipo.alturaMinCm,
        alturaMaxCm: tipo.alturaMaxCm,
        precoHoraCentavos: tipo.precoHoraCentavos,
        precoDiaCentavos: tipo.precoDiaCentavos,
        ativo: !tipo.ativo,
      });
      setAviso(`${tipo.nome} ${tipo.ativo ? "saiu da" : "voltou para a"} busca.`);
      await carregar();
    } catch (e) {
      setErro(mensagem(e, "Não foi possível alterar o tipo."));
    }
  }

  async function mudarStatus(bicicleta: BicicletaAdmin, status: StatusBicicleta) {
    try {
      await patchAutenticado(`/api/admin/bicicletas/${bicicleta.id}`, { status });
      setAviso(`Bicicleta ${bicicleta.codigo}: ${ROTULO_STATUS[status]}.`);
      await carregar();
    } catch (e) {
      setErro(mensagem(e, "Não foi possível mudar o status."));
    }
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-24)" }}>
      <div>
        <h2 style={{ fontSize: "var(--font-size-2xl)", fontWeight: "var(--font-weight-bold)" }}>
          Catálogo
        </h2>
        <p style={{ color: "var(--color-text-support)" }}>
          Tipos de bicicleta e unidades da frota. Só tipos ativos e unidades disponíveis aparecem
          na busca do cliente.
        </p>
      </div>

      {erro && (
        <Alert variant="erro" action={<button type="button" onClick={() => void carregar()}>Tentar de novo</button>}>
          {erro}
        </Alert>
      )}
      {aviso && <Alert variant="sucesso">{aviso}</Alert>}

      {!dados && !erro && <p role="status">Carregando o catálogo...</p>}

      {dados && (
        <>
          <Card title="Tipos de bicicleta" as="section">
            <Table
              legenda="Tipos de bicicleta"
              chaveDaLinha={(t) => t.id}
              linhas={dados.tipos}
              vazio="Nenhum tipo cadastrado ainda."
              colunas={[
                { chave: "nome", cabecalho: "Tipo" },
                {
                  chave: "alturaMinCm",
                  cabecalho: "Altura",
                  celula: (t) => `${t.alturaMinCm}–${t.alturaMaxCm} cm`,
                },
                {
                  chave: "precoHoraCentavos",
                  cabecalho: "Hora / Dia",
                  alinhamento: "direita",
                  celula: (t) => `${formatarReais(t.precoHoraCentavos)} / ${formatarReais(t.precoDiaCentavos)}`,
                },
                {
                  chave: "ativo",
                  cabecalho: "Situação",
                  celula: (t) => (
                    <span style={{ display: "inline-flex", gap: "var(--space-8)", alignItems: "center" }}>
                      <Badge variant={t.ativo ? "sucesso" : "neutro"}>{t.ativo ? "Ativo" : "Inativo"}</Badge>
                      <button type="button" onClick={() => void alternarAtivo(t)}>
                        {t.ativo ? "Desativar" : "Ativar"}
                      </button>
                    </span>
                  ),
                },
              ]}
            />
          </Card>

          <NovoTipo aoCriar={async (nome) => { setAviso(`Tipo ${nome} criado.`); await carregar(); }} />

          <Card title="Bicicletas" as="section">
            <Table
              legenda="Bicicletas da frota"
              chaveDaLinha={(b) => b.id}
              linhas={dados.bicicletas}
              vazio="Nenhuma bicicleta cadastrada ainda."
              colunas={[
                { chave: "codigo", cabecalho: "Código" },
                { chave: "tipo", cabecalho: "Tipo", celula: (b) => b.tipo.nome },
                { chave: "ponto", cabecalho: "Ponto", celula: (b) => b.ponto.nome },
                {
                  chave: "status",
                  cabecalho: "Status",
                  celula: (b) =>
                    b.status === "ALUGADA" ? (
                      ROTULO_STATUS.ALUGADA
                    ) : (
                      <select
                        aria-label={`Status da bicicleta ${b.codigo}`}
                        value={b.status}
                        onChange={(e) => void mudarStatus(b, e.target.value as StatusBicicleta)}
                      >
                        {STATUS_EDITAVEIS.map((s) => (
                          <option key={s} value={s}>
                            {ROTULO_STATUS[s]}
                          </option>
                        ))}
                      </select>
                    ),
                },
              ]}
            />
          </Card>

          <NovaBicicleta
            tipos={dados.tipos}
            pontos={pontosDasBicicletas(dados.bicicletas)}
            aoCriar={async (codigo) => { setAviso(`Bicicleta ${codigo} cadastrada.`); await carregar(); }}
          />
        </>
      )}
    </div>
  );
}

function NovoTipo({ aoCriar }: { aoCriar: (nome: string) => Promise<void> }) {
  const [erros, setErros] = useState<ErrosPorCampo>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [atividades, setAtividades] = useState<Atividade[]>([]);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const f = new FormData(form);
    const texto = (k: string) => String(f.get(k) ?? "");
    const locais: ErrosPorCampo = {};
    const hora = reaisParaCentavos(texto("precoHora"));
    const dia = reaisParaCentavos(texto("precoDia"));
    const caucao = texto("caucao") ? reaisParaCentavos(texto("caucao")) : 0;
    if (hora === null) locais.precoHoraCentavos = "Informe o valor em reais (ex.: 10,00).";
    if (dia === null) locais.precoDiaCentavos = "Informe o valor em reais (ex.: 60,00).";
    if (caucao === null) locais.valorCaucaoCentavos = "Informe o valor em reais (ex.: 200,00).";
    if (Object.keys(locais).length) return setErros(locais);

    setEnviando(true);
    setErros({});
    setErroGeral(null);
    try {
      const nome = texto("nome");
      await postAutenticado("/api/admin/tipos", {
        nome,
        descricao: texto("descricao") || null,
        atividades,
        alturaMinCm: Number(texto("alturaMin")),
        alturaMaxCm: Number(texto("alturaMax")),
        precoHoraCentavos: hora,
        precoDiaCentavos: dia,
        valorCaucaoCentavos: caucao,
      });
      form.reset();
      setAtividades([]);
      await aoCriar(nome);
    } catch (e) {
      if (e instanceof ApiError && e.details) setErros(e.details);
      else setErroGeral(mensagem(e, "Não foi possível criar o tipo."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card title="Novo tipo" as="section">
      <form onSubmit={enviar} style={{ display: "grid", gap: "var(--space-12)" }} noValidate>
        {erroGeral && <Alert variant="erro">{erroGeral}</Alert>}
        <TextField name="nome" label="Nome" icon={<SearchIcon />} error={erros.nome} required />
        <TextField name="descricao" label="Descrição (opcional)" icon={<SearchIcon />} error={erros.descricao} />
        <fieldset style={{ border: "none", padding: 0 }}>
          <legend>Atividades</legend>
          <div style={{ display: "flex", gap: "var(--space-12)", flexWrap: "wrap" }}>
            {ATIVIDADES.map((a) => (
              <label key={a} style={{ display: "inline-flex", gap: "var(--space-4)" }}>
                <input
                  type="checkbox"
                  checked={atividades.includes(a)}
                  onChange={(e) =>
                    setAtividades((atual) => (e.target.checked ? [...atual, a] : atual.filter((x) => x !== a)))
                  }
                />
                {ROTULO_ATIVIDADE[a]}
              </label>
            ))}
          </div>
          {erros.atividades && <p role="alert" style={{ color: "var(--color-danger)" }}>{erros.atividades}</p>}
        </fieldset>
        <TextField name="alturaMin" label="Altura mínima (cm)" type="number" inputMode="numeric" icon={<IdCardIcon />} error={erros.alturaMinCm} />
        <TextField name="alturaMax" label="Altura máxima (cm)" type="number" inputMode="numeric" icon={<IdCardIcon />} error={erros.alturaMaxCm} />
        <TextField name="precoHora" label="Preço por hora (R$)" inputMode="decimal" icon={<IdCardIcon />} error={erros.precoHoraCentavos} />
        <TextField name="precoDia" label="Preço por dia (R$)" inputMode="decimal" icon={<IdCardIcon />} error={erros.precoDiaCentavos} />
        <TextField name="caucao" label="Caução (R$, opcional)" inputMode="decimal" icon={<IdCardIcon />} error={erros.valorCaucaoCentavos} />
        <Button type="submit" loading={enviando} loadingText="Criando...">Criar tipo</Button>
      </form>
    </Card>
  );
}

function NovaBicicleta({
  tipos,
  pontos,
  aoCriar,
}: {
  tipos: TipoAdmin[];
  pontos: { id: string; nome: string }[];
  aoCriar: (codigo: string) => Promise<void>;
}) {
  const [erros, setErros] = useState<ErrosPorCampo>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (tipos.length === 0) return null;
  if (pontos.length === 0) {
    return (
      <Alert variant="aviso">
        Para cadastrar bicicletas pelo painel, a locadora precisa ter ao menos uma bicicleta em um
        ponto de retirada (o ponto vem do banco).
      </Alert>
    );
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const f = new FormData(form);
    const texto = (k: string) => String(f.get(k) ?? "");
    setEnviando(true);
    setErros({});
    setErroGeral(null);
    try {
      const resposta = await postAutenticado<BicicletaAdmin>("/api/admin/bicicletas", {
        tipoId: texto("tipoId"),
        pontoId: texto("pontoId"),
        codigo: texto("codigo"),
        tamanhoQuadro: texto("tamanhoQuadro") || null,
        observacoes: texto("observacoes") || null,
      });
      form.reset();
      await aoCriar(resposta.codigo);
    } catch (e) {
      if (e instanceof ApiError && e.details) setErros(e.details);
      else setErroGeral(mensagem(e, "Não foi possível cadastrar a bicicleta."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card title="Nova bicicleta" as="section">
      <form onSubmit={enviar} style={{ display: "grid", gap: "var(--space-12)" }} noValidate>
        {erroGeral && <Alert variant="erro">{erroGeral}</Alert>}
        <Select name="tipoId" label="Tipo" placeholder="Escolha o tipo" error={erros.tipoId}
          opcoes={tipos.map((t) => ({ valor: t.id, rotulo: t.nome }))} />
        <Select name="pontoId" label="Ponto de retirada" error={erros.pontoId}
          opcoes={pontos.map((p) => ({ valor: p.id, rotulo: p.nome }))} />
        <TextField name="codigo" label="Código (o número colado na bicicleta)" icon={<IdCardIcon />} error={erros.codigo} />
        <TextField name="tamanhoQuadro" label="Tamanho do quadro (opcional)" icon={<IdCardIcon />} error={erros.tamanhoQuadro} />
        <TextField name="observacoes" label="Observações (opcional)" icon={<IdCardIcon />} error={erros.observacoes} />
        <Button type="submit" loading={enviando} loadingText="Cadastrando...">Cadastrar bicicleta</Button>
      </form>
    </Card>
  );
}
