"use client";

import { type FormEvent, useEffect, useState } from "react";
import { ApiError, getAutenticado, putAutenticado } from "@/shared/http/api-cliente";
import { ATIVIDADES, EXPERIENCIAS } from "@/shared/dominio/ciclista";
import { ROTULO_ATIVIDADE, ROTULO_EXPERIENCIA } from "@/shared/dominio/ciclista-rotulos";
import {
  formularioInicial,
  montarCorpo,
  perfilCompleto,
  validarPerfil,
  type ContaLogada,
  type ErrosPerfil,
  type FormularioPerfil,
  type PerfilCiclista,
} from "@/shared/perfil/perfil-ciclista";
import { Alert } from "@/shared/ui/Alert";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Select } from "@/shared/ui/Select";
import { TextField } from "@/shared/ui/TextField";
import { UserIcon } from "@/shared/ui/icons";
import styles from "@/shared/reservas/reservas.module.css";

type Estado =
  | { tipo: "carregando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "pronto"; conta: ContaLogada };

const OPCOES_EXPERIENCIA = EXPERIENCIAS.map((valor) => ({
  valor,
  rotulo: ROTULO_EXPERIENCIA[valor],
}));
const OPCOES_ATIVIDADE = ATIVIDADES.map((valor) => ({ valor, rotulo: ROTULO_ATIVIDADE[valor] }));

// A API devolve os erros de campo com os nomes do contrato; o formulário usa "altura".
function errosDaApi(detalhes: Record<string, string>): ErrosPerfil {
  return {
    altura: detalhes.alturaCm,
    experiencia: detalhes.experiencia,
    atividade: detalhes.atividade,
    corpo: detalhes.corpo,
  };
}

export default function PerfilCiclistaPage() {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [form, setForm] = useState<FormularioPerfil>(formularioInicial());
  const [erros, setErros] = useState<ErrosPerfil>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [salvando, setSalvando] = useState(false);

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

  return (
    <div>
      <h2 className={styles.titulo}>Meu perfil de ciclista</h2>
      <p className={styles.subtitulo}>
        Com esses dados escolhemos as bicicletas certas para você.
      </p>

      {estado.tipo === "carregando" && <p className={styles.vazio}>Carregando o seu perfil...</p>}

      {estado.tipo === "erro" && <Alert variant="erro">{estado.mensagem}</Alert>}

      {estado.tipo === "pronto" && estado.conta.perfil !== "CLIENTE" && (
        <Alert variant="info">
          O perfil de ciclista é usado na recomendação de bicicletas e vale só para contas de
          cliente.
        </Alert>
      )}

      {estado.tipo === "pronto" && estado.conta.perfil === "CLIENTE" && (
        <div style={{ display: "grid", gap: "var(--space-16)" }}>
          <Card title="Sua conta">
            <strong>{estado.conta.nome}</strong>
            <br />
            {estado.conta.email}
          </Card>

          <Card
            title="Dados do ciclista"
            action={
              perfilCompleto(estado.conta.ciclista) ? (
                <Badge variant="sucesso">Completo</Badge>
              ) : (
                <Badge variant="aviso">Faltam dados</Badge>
              )
            }
          >
            <form onSubmit={salvar} noValidate style={{ display: "grid", gap: "var(--space-16)" }}>
              {erroGeral && <Alert variant="erro">{erroGeral}</Alert>}
              {salvo && <Alert variant="sucesso">Perfil salvo. Suas recomendações já usam esses dados.</Alert>}

              <TextField
                label="Altura (cm)"
                icon={<UserIcon />}
                type="text"
                inputMode="numeric"
                placeholder="Ex.: 172"
                value={form.altura}
                onChange={(e) => alterar("altura", e.target.value)}
                error={erros.altura}
                hint="Usamos a altura para sugerir o tamanho certo."
              />

              <Select
                label="Experiência"
                placeholder="Prefiro não informar"
                opcoes={OPCOES_EXPERIENCIA}
                value={form.experiencia}
                onChange={(e) => alterar("experiencia", e.target.value)}
                error={erros.experiencia}
              />

              <Select
                label="Atividade principal"
                placeholder="Prefiro não informar"
                opcoes={OPCOES_ATIVIDADE}
                value={form.atividade}
                onChange={(e) => alterar("atividade", e.target.value)}
                error={erros.atividade}
              />

              <Button type="submit" loading={salvando} showArrow={false}>
                Salvar perfil
              </Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
