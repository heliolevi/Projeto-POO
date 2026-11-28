"use client";

import { type FormEvent, useEffect, useId, useState } from "react";
import { ApiError, ClienteApi } from "@/shared/http/api-cliente";
import { ALTURA_MAX_CM, ALTURA_MIN_CM, ATIVIDADES, EXPERIENCIAS } from "@/shared/dominio/ciclista";
import { RotulosDoCiclista } from "@/shared/dominio/ciclista-rotulos";
import {
  FormularioDePerfil,
  IniciaisDoNome,
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
    rotulo: RotulosDoCiclista.experiencia(valor),
    detalhe: RotulosDoCiclista.descricaoDaExperiencia(valor),
  })),
  NAO_INFORMAR,
];

const OPCOES_ATIVIDADE: OpcaoDeEscolha[] = [
  ...ATIVIDADES.map((valor) => ({
    valor,
    rotulo: RotulosDoCiclista.atividade(valor),
    detalhe: RotulosDoCiclista.descricaoDaAtividade(valor),
  })),
  NAO_INFORMAR,
];

export default function PerfilCiclistaPage() {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [form, setForm] = useState<FormularioPerfil>(FormularioDePerfil.inicial().dados);
  const [erros, setErros] = useState<ErrosPerfil>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const idAltura = useId();

  useEffect(() => {
    let ativo = true;
    ClienteApi.padrao.get<ContaLogada>("/api/conta/me")
      .then((conta) => {
        if (!ativo) return;
        setForm(FormularioDePerfil.inicial(conta.ciclista).dados);
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

  // O valor pode ser uma função do texto atual: os botões − e + usam isso para somar sobre o
  // valor mais recente do campo, e não sobre o que a tela mostrava quando foram desenhados.
  function alterar(campo: keyof FormularioPerfil, valor: string | ((atual: string) => string)) {
    setForm((atual) => new FormularioDePerfil(atual).com(campo, valor).dados);
    setSalvo(false);
    if (erros[campo]) setErros((atual) => ({ ...atual, [campo]: undefined }));
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (estado.tipo !== "pronto") return;

    const encontrados = new FormularioDePerfil(form).validar();
    setErros(encontrados);
    setErroGeral(null);
    setSalvo(false);
    if (Object.keys(encontrados).length > 0) return;

    setSalvando(true);
    try {
      const ciclista = await ClienteApi.padrao.put<PerfilCiclista>(
        "/api/conta/perfil-ciclista",
        new FormularioDePerfil(form).corpo(),
      );
      setEstado({ tipo: "pronto", conta: { ...estado.conta, ciclista } });
      setForm(FormularioDePerfil.inicial(ciclista).dados);
      setSalvo(true);
    } catch (erro) {
      if (erro instanceof ApiError && erro.details) {
        const doServidor = FormularioDePerfil.errosDaApi(erro.details);
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

  const informados = new FormularioDePerfil(form).dadosInformados();

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
              {IniciaisDoNome.de(estado.conta.nome)}
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
                  onClick={() => alterar("altura", (atual) => FormularioDePerfil.ajustarAltura(atual, -1))}
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
                  onClick={() => alterar("altura", (atual) => FormularioDePerfil.ajustarAltura(atual, 1))}
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
