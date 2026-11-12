"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { limparSessao } from "@/shared/auth/sessao";
import {
  CONFIRMACAO_DESATIVAR,
  confirmacaoValida,
  mensagemDeErro,
  validarAltura,
  validarTrocaDeSenha,
  type ErrosSenha,
  type FormularioSenha,
} from "@/shared/conta/conta";
import { ApiError, getAutenticado, postAutenticado } from "@/shared/http/api-cliente";
import type { ContaLogada } from "@/shared/perfil/perfil-ciclista";
import styles from "@/shared/reservas/reservas.module.css";
import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Modal } from "@/shared/ui/Modal";
import { PasswordField } from "@/shared/ui/PasswordField";
import { TextField } from "@/shared/ui/TextField";
import { UserIcon } from "@/shared/ui/icons";
import contaStyles from "./conta.module.css";

const SENHA_VAZIA: FormularioSenha = { senhaAtual: "", novaSenha: "", confirmar: "" };

type Estado =
  | { tipo: "carregando" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "pronto"; conta: ContaLogada };

function textoDoErro(erro: unknown): string {
  return erro instanceof ApiError
    ? mensagemDeErro(erro)
    : "Não foi possível concluir agora. Verifique a conexão e tente novamente.";
}

export default function MinhaContaPage() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });

  useEffect(() => {
    let ativo = true;
    getAutenticado<ContaLogada>("/api/conta/me")
      .then((conta) => {
        if (ativo) setEstado({ tipo: "pronto", conta });
      })
      .catch((erro) => {
        if (ativo) setEstado({ tipo: "erro", mensagem: textoDoErro(erro) });
      });
    return () => {
      ativo = false;
    };
  }, []);

  if (estado.tipo === "carregando") return <p className={styles.vazio}>Carregando a sua conta...</p>;
  if (estado.tipo === "erro") return <Alert variant="erro">{estado.mensagem}</Alert>;

  const { conta } = estado;

  function aoDesativar() {
    limparSessao();
    router.replace("/login");
  }

  return (
    <div>
      <h2 className={styles.titulo}>Minha conta</h2>
      <p className={styles.subtitulo}>Gerencie a sua senha, a sua altura e o acesso à conta.</p>

      <div className={contaStyles.secoes}>
        <Card title="Seus dados">
          <strong>{conta.nome}</strong>
          <br />
          {conta.email}
        </Card>

        <SecaoSenha />
        {conta.perfil === "CLIENTE" && <SecaoAltura alturaInicial={conta.ciclista?.alturaCm ?? null} />}
        <SecaoDesativar onDesativada={aoDesativar} />
      </div>
    </div>
  );
}

function SecaoSenha() {
  const [form, setForm] = useState<FormularioSenha>(SENHA_VAZIA);
  const [visivel, setVisivel] = useState({ atual: false, nova: false, confirmar: false });
  const [erros, setErros] = useState<ErrosSenha>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [enviando, setEnviando] = useState(false);

  function alterar(campo: keyof FormularioSenha, valor: string) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
    setSucesso(false);
    if (erros[campo]) setErros((atual) => ({ ...atual, [campo]: undefined }));
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErroGeral(null);
    setSucesso(false);
    const encontrados = validarTrocaDeSenha(form);
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    setEnviando(true);
    try {
      await postAutenticado(
        "/api/conta/senha",
        { senhaAtual: form.senhaAtual, novaSenha: form.novaSenha },
        { sairSeNaoAutorizado: false },
      );
      setForm(SENHA_VAZIA);
      setSucesso(true);
    } catch (erro) {
      if (erro instanceof ApiError && erro.code === "UNAUTHORIZED") {
        // O 401 vale para "senha atual errada" e para "sessão acabou". Perguntar à API quem é
        // o usuário separa os dois: se a sessão caiu, o cliente HTTP já leva ao login.
        try {
          await getAutenticado("/api/conta/me");
          setErros({ senhaAtual: mensagemDeErro(erro, "senha") });
        } catch {
          setErroGeral(mensagemDeErro(erro));
        }
      } else if (erro instanceof ApiError && erro.details) {
        setErros(erro.details as ErrosSenha);
        setErroGeral(mensagemDeErro(erro));
      } else {
        setErroGeral(textoDoErro(erro));
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card title="Alterar senha">
      <form onSubmit={enviar} noValidate className={contaStyles.formulario}>
        {erroGeral && <Alert variant="erro">{erroGeral}</Alert>}
        {sucesso && <Alert variant="sucesso">Senha alterada com sucesso.</Alert>}

        <PasswordField
          label="Senha atual"
          autoComplete="current-password"
          value={form.senhaAtual}
          onChange={(e) => alterar("senhaAtual", e.target.value)}
          error={erros.senhaAtual}
          visible={visivel.atual}
          onToggleVisible={(v) => setVisivel((a) => ({ ...a, atual: v }))}
        />
        <PasswordField
          label="Nova senha"
          placeholder="No mínimo 8 caracteres"
          autoComplete="new-password"
          value={form.novaSenha}
          onChange={(e) => alterar("novaSenha", e.target.value)}
          error={erros.novaSenha}
          visible={visivel.nova}
          onToggleVisible={(v) => setVisivel((a) => ({ ...a, nova: v }))}
        />
        <PasswordField
          label="Confirmar nova senha"
          autoComplete="new-password"
          value={form.confirmar}
          onChange={(e) => alterar("confirmar", e.target.value)}
          error={erros.confirmar}
          visible={visivel.confirmar}
          onToggleVisible={(v) => setVisivel((a) => ({ ...a, confirmar: v }))}
        />

        <Button type="submit" loading={enviando} showArrow={false}>
          Alterar senha
        </Button>
      </form>
    </Card>
  );
}

function SecaoAltura({ alturaInicial }: { alturaInicial: number | null }) {
  const [altura, setAltura] = useState(alturaInicial === null ? "" : String(alturaInicial));
  const [erro, setErro] = useState<string | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setErroGeral(null);
    setSucesso(false);
    const validada = validarAltura(altura);
    if ("erro" in validada) {
      setErro(validada.erro);
      return;
    }

    setEnviando(true);
    try {
      await postAutenticado("/api/conta/altura", { alturaCm: validada.alturaCm });
      setSucesso(true);
    } catch (e) {
      if (e instanceof ApiError && e.details?.alturaCm) setErro(e.details.alturaCm);
      else setErroGeral(textoDoErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card title="Altura">
      <form onSubmit={enviar} noValidate className={contaStyles.formulario}>
        {erroGeral && <Alert variant="erro">{erroGeral}</Alert>}
        {sucesso && (
          <Alert variant="sucesso">Altura atualizada. As recomendações já usam o novo valor.</Alert>
        )}
        <TextField
          label="Altura (cm)"
          icon={<UserIcon />}
          inputMode="numeric"
          placeholder="Ex.: 172"
          value={altura}
          onChange={(e) => {
            setAltura(e.target.value);
            setSucesso(false);
            setErro(null);
          }}
          error={erro ?? undefined}
          hint="Usamos a altura para sugerir o tamanho certo."
        />
        <Button type="submit" loading={enviando} showArrow={false}>
          Salvar altura
        </Button>
      </form>
    </Card>
  );
}

function SecaoDesativar({ onDesativada }: { onDesativada: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function fechar() {
    if (enviando) return;
    setAberto(false);
    setTexto("");
    setErro(null);
  }

  async function desativar() {
    if (!confirmacaoValida(texto)) return;
    setEnviando(true);
    setErro(null);
    try {
      await postAutenticado("/api/conta/desativar", {});
      onDesativada();
    } catch (e) {
      setErro(textoDoErro(e));
      setEnviando(false);
    }
  }

  return (
    <Card title="Desativar conta">
      <p className={contaStyles.texto}>
        Ao desativar, você deixa de conseguir entrar no Bike Ilha Club.
      </p>
      <button type="button" className={contaStyles.perigo} onClick={() => setAberto(true)}>
        Desativar minha conta
      </button>

      <Modal
        aberto={aberto}
        onFechar={fechar}
        titulo="Desativar a conta?"
        rodape={
          <>
            <button
              type="button"
              className={contaStyles.secundario}
              onClick={fechar}
              disabled={enviando}
            >
              Voltar
            </button>
            <button
              type="button"
              className={contaStyles.perigo}
              onClick={desativar}
              disabled={!confirmacaoValida(texto) || enviando}
            >
              {enviando ? "Desativando..." : "Desativar conta"}
            </button>
          </>
        }
      >
        <div className={contaStyles.formulario}>
          <Alert variant="aviso" title="O que acontece com as suas reservas">
            <ul className={contaStyles.lista}>
              <li>Você sai agora e não consegue mais entrar com esta conta.</li>
              <li>
                Reservas abertas (aguardando pagamento ou confirmadas){" "}
                <strong>não são canceladas</strong> e continuam valendo. Se não for retirar a
                bicicleta, cancele antes de desativar.
              </li>
              <li>Os seus dados não são apagados. Para eliminá-los, peça por e-mail à locadora.</li>
            </ul>
          </Alert>
          {erro && <Alert variant="erro">{erro}</Alert>}
          <TextField
            label={`Digite ${CONFIRMACAO_DESATIVAR} para confirmar`}
            icon={<UserIcon />}
            autoComplete="off"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>
      </Modal>
    </Card>
  );
}
