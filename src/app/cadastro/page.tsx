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
import { requisitosDaSenha, senhaAceita } from "@/shared/format/senha";
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

  const requisitos = requisitosDaSenha(senha);
  const senhasConferem = confirmarSenha !== "" && confirmarSenha === senha;

  function validarLocalmente(): boolean {
    const proximosErros: Record<string, string> = {};
    if (!cpfValido(somenteDigitos(cpf))) {
      proximosErros.cpf = "CPF inválido. Confira os 11 números.";
    }
    if (!senhaAceita(senha)) {
      proximosErros.senha = "A senha precisa de 8 caracteres ou mais, com uma letra e um número.";
    }
    if (confirmarSenha !== senha) {
      proximosErros.confirmarSenha = "As senhas não são iguais.";
    }
    if (!aceiteTermos) {
      proximosErros.aceiteTermos = "Para criar a conta, aceite os termos de uso.";
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
      showBanner
      title="Crie sua conta"
      subtitle="Leva um minuto. Depois é só escolher o dia e a bicicleta."
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
        {erroGeral && (
          <div className={authStyles.formError} role="alert">
            {erroGeral}
          </div>
        )}

        <div className={authStyles.secao} role="group" aria-labelledby="cadastro-dados">
          <h3 id="cadastro-dados" className={authStyles.secaoTitulo}>
            Seus dados
          </h3>

          <TextField
            label="Nome completo"
            icon={<UserIcon />}
            placeholder="Como está no documento"
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
            placeholder="voce@exemplo.com"
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
            hint="Conferimos o CPF com o seu documento na retirada."
            maxLength={14}
            required
          />
        </div>

        <div className={authStyles.secao} role="group" aria-labelledby="cadastro-senha">
          <h3 id="cadastro-senha" className={authStyles.secaoTitulo}>
            Sua senha
          </h3>

          <PasswordField
            label="Senha"
            placeholder="Crie uma senha"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            error={erros.senha}
            visible={senhaVisivel}
            onToggleVisible={setSenhaVisivel}
            required
          />

          <ul className={authStyles.requisitos} aria-label="A senha precisa ter">
            {requisitos.map((requisito) => (
              <li
                key={requisito.id}
                className={`${authStyles.requisito} ${requisito.ok ? authStyles.requisitoOk : ""}`}
              >
                <span className={authStyles.requisitoMarca} aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="10" height="10" fill="none">
                    <path
                      d="M3.5 8.5l3 3 6-7"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                {requisito.texto}
                <span className={styles.somenteLeitor}>
                  {requisito.ok ? " (cumprido)" : " (falta)"}
                </span>
              </li>
            ))}
          </ul>

          <PasswordField
            label="Repita a senha"
            placeholder="Digite a mesma senha"
            autoComplete="new-password"
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
            error={erros.confirmarSenha}
            visible={confirmarSenhaVisivel}
            onToggleVisible={setConfirmarSenhaVisivel}
            required
          />
          {senhasConferem && !erros.confirmarSenha && (
            <p className={authStyles.confere} role="status">
              As duas senhas são iguais.
            </p>
          )}
        </div>

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
                Termos de Uso<span className={styles.somenteLeitor}> (abre em nova aba)</span>
              </Link>{" "}
              e a{" "}
              <Link href="/privacidade" target="_blank" rel="noopener noreferrer">
                Política de Privacidade<span className={styles.somenteLeitor}> (abre em nova aba)</span>
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

        <Button type="submit" loading={enviando} loadingText="Criando sua conta...">
          Criar conta
        </Button>
      </form>
    </AuthLayout>
  );
}
