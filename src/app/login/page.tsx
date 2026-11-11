"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, type FormEvent, useState } from "react";
import { Button } from "@/shared/ui/Button";
import { PasswordField } from "@/shared/ui/PasswordField";
import { TextField } from "@/shared/ui/TextField";
import { AuthLayout } from "@/shared/ui/AuthLayout";
import { MailIcon } from "@/shared/ui/icons";
import styles from "@/shared/ui/form.module.css";
import authStyles from "@/shared/ui/AuthLayout.module.css";
import { ApiError, postJson, type ResultadoSessao } from "@/shared/http/api-cliente";
import { salvarSessao } from "@/shared/auth/sessao";

// rota de origem (ex.: /perfil, guardada pela guarda de rota) para voltar depois do login
function destinoSeguro(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/app";
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const parametros = useSearchParams();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErros({});
    setErroGeral(null);
    setEnviando(true);
    try {
      const sessao = await postJson<ResultadoSessao>("/api/auth/login", { email, senha });
      salvarSessao(sessao.token);
      router.push(destinoSeguro(parametros.get("next")));
    } catch (erro) {
      if (erro instanceof ApiError) {
        if (erro.details) setErros(erro.details);
        else setErroGeral(erro.message);
      } else {
        setErroGeral("Não foi possível entrar agora. Tente novamente.");
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthLayout
      showBanner
      title="Que bom ter você aqui!"
      subtitle="Entre na sua conta e descubra São Luís de bicicleta."
      footer={
        <>
          Ainda não tem conta?{" "}
          <Link href="/cadastro" className={authStyles.footerLink}>
            Criar conta
          </Link>
        </>
      }
    >
      <form className={authStyles.form} onSubmit={aoEnviar} noValidate>
        {erroGeral && <div className={authStyles.formError}>{erroGeral}</div>}

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

        <PasswordField
          label="Senha"
          placeholder="Digite sua senha"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          error={erros.senha}
          visible={senhaVisivel}
          onToggleVisible={setSenhaVisivel}
          required
        />

        <div className={styles.rowBetween}>
          <label className={styles.checkboxRow} style={{ alignItems: "center" }}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={senhaVisivel}
              onChange={(e) => setSenhaVisivel(e.target.checked)}
            />
            <span className={styles.checkboxLabel}>Mostrar senha</span>
          </label>
          <Link href="/esqueci-senha" className={styles.link}>
            Esqueceu a senha?
          </Link>
        </div>

        <Button type="submit" loading={enviando}>
          Entrar
        </Button>
      </form>
    </AuthLayout>
  );
}
