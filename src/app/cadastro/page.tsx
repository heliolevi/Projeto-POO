"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/shared/ui/Button";
import { PasswordField } from "@/shared/ui/PasswordField";
import { TextField } from "@/shared/ui/TextField";
import { AuthLayout } from "@/shared/ui/AuthLayout";
import { IdCardIcon, MailIcon, UserIcon } from "@/shared/ui/icons";
import styles from "@/shared/ui/form.module.css";
import authStyles from "@/shared/ui/AuthLayout.module.css";
import { ApiError, postJson, type ResultadoSessao } from "@/shared/http/api-cliente";
import { cpfValido, maskCpf, somenteDigitos } from "@/shared/format/cpf";
import { salvarSessao } from "@/shared/auth/sessao";

export default function CadastroPage() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [confirmarSenhaVisivel, setConfirmarSenhaVisivel] = useState(false);
  const [aceiteTermos, setAceiteTermos] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function validarLocalmente(): boolean {
    const proximosErros: Record<string, string> = {};
    if (!cpfValido(somenteDigitos(cpf))) {
      proximosErros.cpf = "CPF inválido.";
    }
    if (confirmarSenha !== senha) {
      proximosErros.confirmarSenha = "As senhas não coincidem.";
    }
    if (!aceiteTermos) {
      proximosErros.aceiteTermos = "É necessário aceitar os termos de uso.";
    }
    setErros((atual) => ({ ...atual, ...proximosErros }));
    return Object.keys(proximosErros).length === 0;
  }

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErros({});
    setErroGeral(null);
    if (!validarLocalmente()) return;

    setEnviando(true);
    try {
      const sessao = await postJson<ResultadoSessao>("/api/auth/cadastro", {
        nome,
        email,
        cpf: somenteDigitos(cpf),
        senha,
        aceiteTermos,
      });
      salvarSessao(sessao.token);
      router.push("/app");
    } catch (erro) {
      if (erro instanceof ApiError) {
        if (erro.details) setErros((atual) => ({ ...atual, ...erro.details }));
        else if (erro.code === "CONFLICT") setErros((atual) => ({ ...atual, cpf: erro.message }));
        else setErroGeral(erro.message);
      } else {
        setErroGeral("Não foi possível criar sua conta agora. Tente novamente.");
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthLayout
      backHref="/login"
      eyebrow="🚲 Pedale pela Ilha do Amor"
      title="Seu próximo pedal começa aqui."
      subtitle="Crie sua conta no Bike Ilha Club."
      footer={
        <>
          Já tem uma conta?{" "}
          <Link href="/login" className={authStyles.footerLink}>
            Entrar
          </Link>
        </>
      }
    >
      <form className={authStyles.form} onSubmit={aoEnviar} noValidate>
        {erroGeral && <div className={authStyles.formError}>{erroGeral}</div>}

        <TextField
          label="Nome completo"
          icon={<UserIcon />}
          placeholder="Como você se chama?"
          autoComplete="name"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          error={erros.nome}
          required
        />

        <TextField
          label="E-mail"
          icon={<MailIcon />}
          type="email"
          placeholder="Seu e-mail"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={erros.email}
          required
        />

        <TextField
          label="CPF"
          icon={<IdCardIcon />}
          inputMode="numeric"
          placeholder="000.000.000-00"
          autoComplete="off"
          value={cpf}
          onChange={(e) => setCpf(maskCpf(e.target.value))}
          error={erros.cpf}
          maxLength={14}
          required
        />

        <PasswordField
          label="Senha"
          placeholder="No mínimo 8 caracteres"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          error={erros.senha}
          visible={senhaVisivel}
          onToggleVisible={setSenhaVisivel}
          required
        />

        <PasswordField
          label="Confirmar senha"
          placeholder="Digite a senha novamente"
          autoComplete="new-password"
          value={confirmarSenha}
          onChange={(e) => setConfirmarSenha(e.target.value)}
          error={erros.confirmarSenha}
          visible={confirmarSenhaVisivel}
          onToggleVisible={setConfirmarSenhaVisivel}
          required
        />

        <div>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={aceiteTermos}
              onChange={(e) => setAceiteTermos(e.target.checked)}
            />
            <span className={styles.checkboxLabel}>
              Li e concordo com os{" "}
              <Link href="/termos" target="_blank" rel="noopener noreferrer">
                Termos de Uso
              </Link>{" "}
              e a{" "}
              <Link href="/privacidade" target="_blank" rel="noopener noreferrer">
                Política de Privacidade
              </Link>
              .
            </span>
          </label>
          {erros.aceiteTermos && (
            <span className={styles.errorText} style={{ display: "block", marginTop: 4 }}>
              {erros.aceiteTermos}
            </span>
          )}
        </div>

        <Button type="submit" loading={enviando}>
          Criar conta
        </Button>
      </form>
    </AuthLayout>
  );
}
