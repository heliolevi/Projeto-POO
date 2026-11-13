# Ambiente local: rodar o projeto do zero

Este guia leva uma pessoa que nunca rodou o projeto até o app funcionando no próprio computador, em
cerca de 15 minutos. O app usa o banco do **Neon, branch `dev`**: não há banco para instalar.

> **Segurança.** Strings de conexão e senhas ficam só no `.env.local`, que o Git ignora. Nunca cole
> esses valores em PR, issue, commit ou chat de grupo; peça ao Luis por mensagem privada. O banco de
> **production** só se usa com a autorização dele.

## 1. Pré-requisitos

- Git e uma conta do GitHub com acesso ao repositório.
- **Node.js 22 LTS** (22.18 ou mais novo; o npm vem junto, versão 10). A CI usa Node 22 e o
  `package-lock.json` é gerado com npm 10: com Node 24 o lockfile pode mudar sozinho.
- Um editor (VS Code) e um terminal (no Windows, o PowerShell).
- As duas conexões do Neon `dev` (`app_login` e a conexão direta), pedidas ao Luis em privado.

Confira as versões:

```bash
node -v    # v22.18 ou mais novo, na linha 22
npm -v     # 10.x
```

## 2. Baixar o projeto e instalar

```bash
git clone https://github.com/heliolevi/Projeto-POO.git
cd Projeto-POO
git checkout dev
npm ci
cd db && npm ci && cd ..
```

Use `npm ci` (e não `npm install`): ele instala exatamente o que está no `package-lock.json` e não
altera o arquivo.

## 3. Variáveis de ambiente (`.env.local`)

Copie o modelo e preencha na própria pasta do projeto:

```bash
cp .env.example .env.local            # Linux e macOS
Copy-Item .env.example .env.local     # PowerShell
```

| Variável | O que colocar |
|---|---|
| `DATABASE_URL` | Conexão do app: usuário **`app_login`**, host com `-pooler`. |
| `DATABASE_URL_UNPOOLED` | Conexão direta (sem `-pooler`), do dono do banco. Usada por migrations, seed e `criar-equipe`. |
| `SESSION_SECRET` | Valor aleatório com 32+ caracteres. Gere com o comando abaixo. O valor de exemplo é recusado. |
| `HEALTH_DB_SECRET` | Opcional (16+ caracteres). Sem ele, `/api/health/db` fica desligada. |
| `SEED_ADMIN_SENHA`, `SEED_OPERADOR_SENHA` | Senhas de teste das contas do seed (8+ caracteres, com letra e número). Invente as suas. |

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Confira **qual usuário e host** cada conexão usa, sem mostrar a senha (PowerShell):

```powershell
Get-Content .env.local | Where-Object { $_ -match '^DATABASE_URL' } | ForEach-Object { $n,$v = $_ -split '=',2; $u = [uri]($v.Trim().Trim('"').Trim("'")); "$n -> usuario: $($u.UserInfo.Split(':')[0]) | host: $($u.Host)" }
```

Esperado: `DATABASE_URL` com `app_login` e `-pooler` no host; `DATABASE_URL_UNPOOLED` sem `-pooler`. Se
`DATABASE_URL` mostrar `USUARIO`, ainda é o texto do modelo. Se mostrar `neondb_owner`, o app
funciona, mas a segurança por linha (RLS) é ignorada e você não está testando o que vai para
production.

## 4. Banco: migrations e seed

Tudo dentro da pasta `db/` e só no branch **dev** do Neon (o runner mostra o host antes de agir;
confira):

```bash
cd db
npm run migrar:status          # o que já foi aplicado
npm run migrar                 # aplica as pendentes (no dev compartilhado, em geral já estão)
npm run seed:dev -- --ok-dev   # dados de exemplo: ponto, 6 tipos, 14 bicicletas, admin e operador
cd ..
```

O seed pode rodar várias vezes (atualiza em vez de duplicar) e cria `admin@bikeilha.test` e
`operador@bikeilha.test` com as senhas `SEED_*` do seu `.env.local`. Detalhes em
[db/README.md](../db/README.md).

## 5. Conta de equipe (ADMIN e OPERADOR)

As contas do seed já servem para testar. Para criar outra conta de equipe, na raiz do projeto:

```bash
npm run criar-equipe
```

O script pergunta perfil, nome, e-mail e senha (oculta), mostra o host e só grava depois de você
digitar `sim`. Use e-mails `@bikeilha.test`: o banco `dev` é compartilhado e não deve receber contas
com e-mail de pessoas reais. Veja "Contas da equipe" em [db/README.md](../db/README.md).

## 6. Subir o app

```bash
npm run dev
```

Abra <http://localhost:3000>. Para parar, **Ctrl+C** no terminal. (`npm run build` só confere se o
projeto compila; não sobe o app para desenvolvimento.)

- `/api/health`: o app está de pé.
- `/api/health/db`: estado do banco, com o cabeçalho `Authorization: Bearer <HEALTH_DB_SECRET>`.
- Telas: `/cadastro` e `/login` (cliente), `/buscar`, `/minhas-reservas`, `/perfil`. Com a conta de
  operador ou admin, o login leva ao painel da equipe ou da plataforma.

Teste rápido: entre com `admin@bikeilha.test` (cai no painel da plataforma) e com
`operador@bikeilha.test` (cai no painel da equipe).

## 7. Testes e verificações

Na raiz do projeto, o que a CI também roda:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Os testes do banco (`npm run teste:banco`, dentro de `db/`) rodam na CI, num Postgres descartável.
Localmente, só use um banco de teste que possa ser apagado; combine com o Luis antes de apontá-los
para o Neon `dev`, e **nunca** para production.

## 8. Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `password authentication failed for user 'USUARIO'` | `.env.local` ainda com o texto do modelo | Preencha as conexões reais (passo 3). |
| Login dá erro 500 | `SESSION_SECRET` ausente, curto ou igual ao exemplo | Gere um valor novo e reinicie o `npm run dev`. |
| `criar-equipe` recusa a conexão | `DATABASE_URL_UNPOOLED` com `-pooler` | Use a conexão direta, sem `-pooler`. |
| Erro com arquivos `.ts` ao rodar scripts ou testes | Node anterior a 22.18 | Instale o Node 22 LTS (`node -v`). |
| Aviso `MODULE_TYPELESS_PACKAGE_JSON` | Node importando `.ts` do app | Só informativo, pode ignorar. |
| Avisos `LF will be replaced by CRLF` no Git | Quebra de linha do Windows | Inofensivo; use `git add` com os caminhos dos arquivos. |
| `npm run dev` não pega mudança do `.env.local` | Variáveis são lidas na subida | Pare com Ctrl+C e suba de novo. |
| Falha no build ao baixar a fonte do Google | Falha de rede passageira | Rode de novo. |

## 9. Deu certo se...

- [ ] `node -v` mostra 22.18 ou mais novo.
- [ ] `/api/health` responde e `/api/health/db` mostra o banco.
- [ ] O login do admin leva ao painel da plataforma e o do operador, ao painel da equipe.
- [ ] `npm run lint`, `npm run typecheck` e `npm test` passam.
- [ ] `git status` não mostra `.env.local`.
