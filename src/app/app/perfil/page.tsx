"use client";

import { type FormEvent, useEffect, useId, useState } from "react";
import { ApiError, getAutenticado, putAutenticado } from "@/shared/http/api-cliente";
import { ALTURA_MAX_CM, ALTURA_MIN_CM, ATIVIDADES, EXPERIENCIAS } from "@/shared/dominio/ciclista";
import {
  DESCRICAO_ATIVIDADE,
  DESCRICAO_EXPERIENCIA,
  ROTULO_ATIVIDADE,
  ROTULO_EXPERIENCIA,
} from "@/shared/dominio/ciclista-rotulos";
import {
  ajustarAltura,
  dadosInformados,
  formularioInicial,
  montarCorpo,
  validarPerfil,
  type ContaLogada,
  type ErrosPerfil,
  type FormularioPerfil,
  type PerfilCiclista,
} from "@/shared/perfil/perfil-ciclista";
import styles from "@/shared/perfil/Perfil.module.css";
import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { Escolha, type OpcaoDeEscolha } from "@/shared/ui/Escolha";

type Estado =
  | { tipo: "carregando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "pronto"; conta: ContaLogada };

const NAO_INFORMAR: OpcaoDeEscolha = {
  valor: "",
  rotulo: "Prefiro não informar",
  detalhe: "A recomendação considera só o resto.",
};

const OPCOES_EXPERIENCIA: OpcaoDeEscolha[] = [
  ...EXPERIENCIAS.map((valor) => ({
    valor,
    rotulo: ROTULO_EXPERIENCIA[valor],
    detalhe: DESCRICAO_EXPERIENCIA[valor],
  })),
  NAO_INFORMAR,
];

const OPCOES_ATIVIDADE: OpcaoDeEscolha[] = [
  ...ATIVIDADES.map((valor) => ({
    valor,
    rotulo: ROTULO_ATIVIDADE[valor],
    detalhe: DESCRICAO_ATIVIDADE[valor],
  })),
  NAO_INFORMAR,
];

// A API devolve os erros de campo com os nomes do contrato; o formulário usa "altura".
function errosDaApi(detalhes: Record<string, string>): ErrosPerfil {
  return {
    altura: detalhes.alturaCm,
    experiencia: detalhes.experiencia,
    atividade: detalhes.atividade,
    corpo: detalhes.corpo,
  };
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return `${primeira}${ultima}`.toUpperCase();
}

export default function PerfilCiclistaPage() {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [form, setForm] = useState<FormularioPerfil>(formularioInicial());
  const [erros, setErros] = useState<ErrosPerfil>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const idAltura = useId();

  useEffect(() => {
    let ativo = true;
    getAutenticado<ContaLogada>("/api/conta/me")
      .then((conta) => {
        if (!ativo) return;
        setForm(formularioInicial(conta.ciclista));
        setEstado({ tipo: "pronto", conta });
      })
      .catch((erro) => {
        if (!ativo) return;
        setEstado({
          tipo: "erro",
          mensagem:
            erro instanceof ApiError
              ? erro.message
              : "Não foi possível carregar o seu perfil agora. Tente novamente.",
        });
      });
    return () => {
      ativo = false;
    };
  }, []);

  function alterar(campo: keyof FormularioPerfil, valor: string) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
    setSalvo(false);
    if (erros[campo]) setErros((atual) => ({ ...atual, [campo]: undefined }));
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (estado.tipo !== "pronto") return;

    const encontrados = validarPerfil(form);
    setErros(encontrados);
    setErroGeral(null);
    setSalvo(false);
    if (Object.keys(encontrados).length > 0) return;

    setSalvando(true);
    try {
      const ciclista = await putAutenticado<PerfilCiclista>(
        "/api/conta/perfil-ciclista",
        montarCorpo(form),
      );
      setEstado({ tipo: "pronto", conta: { ...estado.conta, ciclista } });
      setForm(formularioInicial(ciclista));
      setSalvo(true);
    } catch (erro) {
      if (erro instanceof ApiError && erro.details) {
        const doServidor = errosDaApi(erro.details);
        setErros(doServidor);
        if (doServidor.corpo) setErroGeral(doServidor.corpo);
        // Se a API mandar um detalhe que a tela não conhece, não deixa o usuário sem resposta.
        else if (!Object.values(doServidor).some(Boolean)) setErroGeral(erro.message);
      } else {
        setErroGeral(
          erro instanceof ApiError
            ? erro.message
            : "Não foi possível salvar agora. Tente novamente em instantes.",
        );
      }
    } finally {
      setSalvando(false);
    }
  }

  const informados = dadosInformados(form);

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <h2 className={styles.titulo}>Seu perfil de ciclista</h2>
        <p className={styles.subtitulo}>
          Com sua altura, sua experiência e o que você gosta de fazer, a busca mostra primeiro a
          bicicleta do tamanho e do tipo certos.
        </p>
      </header>

      {estado.tipo === "carregando" && (
        <p className={styles.subtitulo} role="status">
          Carregando o seu perfil...
        </p>
      )}

      {estado.tipo === "erro" && <Alert variant="erro">{estado.mensagem}</Alert>}

      {estado.tipo === "pronto" && estado.conta.perfil !== "CLIENTE" && (
        <Alert variant="info">
          O perfil de ciclista é usado na recomendação de bicicletas e vale só para contas de
          cliente.
        </Alert>
      )}

      {estado.tipo === "pronto" && estado.conta.perfil === "CLIENTE" && (
        <>
          <div className={styles.conta}>
            <span className={styles.iniciais} aria-hidden="true">
              {iniciais(estado.conta.nome)}
            </span>
            <div className={styles.contaTexto}>
              <span className={styles.contaNome}>{estado.conta.nome}</span>
              <span className={styles.contaEmail}>{estado.conta.email}</span>
            </div>
          </div>

          <div className={styles.progresso}>
            <p className={styles.progressoTexto}>
              <span>
                <strong>{informados} de 3</strong> dados informados
              </span>
              {informados === 3 && <span>Perfil completo</span>}
            </p>
            <div
              className={styles.segmentos}
              role="progressbar"
              aria-label="Dados do perfil informados"
              aria-valuemin={0}
              aria-valuemax={3}
              aria-valuenow={informados}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={`${styles.segmento} ${i < informados ? styles.segmentoCheio : ""}`}
                />
              ))}
            </div>
          </div>

          <form onSubmit={salvar} noValidate className={styles.formulario}>
            <div className={styles.altura}>
              <label htmlFor={idAltura} className={styles.alturaRotulo}>
                Sua altura
              </label>
              <div className={styles.alturaControle}>
                <button
                  type="button"
                  className={styles.passo}
                  onClick={() => alterar("altura", ajustarAltura(form.altura, -1))}
                  aria-label="Diminuir 1 centímetro"
                >
                  −
                </button>
                <div
                  className={`${styles.alturaCampo} ${erros.altura ? styles.alturaCampoErro : ""}`}
                >
                  <input
                    id={idAltura}
                    className={styles.alturaEntrada}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={3}
                    placeholder="170"
                    value={form.altura}
                    onChange={(e) => alterar("altura", e.target.value.replace(/\D/g, ""))}
                    aria-invalid={Boolean(erros.altura)}
                    aria-describedby={`${idAltura}-ajuda`}
                  />
                  <span className={styles.alturaUnidade} aria-hidden="true">
                    cm
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.passo}
                  onClick={() => alterar("altura", ajustarAltura(form.altura, 1))}
                  aria-label="Aumentar 1 centímetro"
                >
                  +
                </button>
              </div>
              <p
                id={`${idAltura}-ajuda`}
                className={erros.altura ? styles.erro : styles.dica}
                role={erros.altura ? "alert" : undefined}
              >
                {erros.altura ??
                  `Em centímetros, de ${ALTURA_MIN_CM} a ${ALTURA_MAX_CM}. Define o tamanho do quadro.`}
              </p>
            </div>

            <Escolha
              legenda="Sua experiência"
              formato="cartao"
              opcoes={OPCOES_EXPERIENCIA}
              valor={form.experiencia}
              aoMudar={(valor) => alterar("experiencia", valor)}
              erro={erros.experiencia}
            />

            <Escolha
              legenda="O que você mais faz de bicicleta"
              formato="cartao"
              opcoes={OPCOES_ATIVIDADE}
              valor={form.atividade}
              aoMudar={(valor) => alterar("atividade", valor)}
              erro={erros.atividade}
            />

            {erroGeral && <Alert variant="erro">{erroGeral}</Alert>}
            {salvo && (
              <Alert variant="sucesso">Perfil salvo. A busca já usa esses dados.</Alert>
            )}

            <Button type="submit" loading={salvando} loadingText="Salvando..." showArrow={false}>
              Salvar perfil
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
