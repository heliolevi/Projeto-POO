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
| `APP_URL` | Endereço público do app (`http://localhost:3000` em desenvolvimento). Em production é obrigatório e precisa ser `https`. |
| `PAGAMENTO_MODO` | `simulado` (único modo no MVP). Em production é obrigatório; em desenvolvimento, se faltar, vale `simulado`. |
| `HEALTH_DB_SECRET` | Opcional (16+ caracteres). Sem ele, `/api/health/db` fica desligada. |
| `SEED_ADMIN_SENHA`, `SEED_OPERADOR_SENHA` | Senhas de teste das contas do seed (8+ caracteres, com letra e número). Invente as suas. |
| `STRIPE_SECRET_KEY` | Chave secreta da Stripe. Localmente, use a de **teste** (`sk_test_...`). Sem ela, pagar dá `502`. |
| `STRIPE_WEBHOOK_SECRET` | Segredo do webhook (`whsec_...`). Localmente, o `stripe listen` mostra o valor (veja abaixo). |

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

### Pix: teste x de verdade

Com `sk_test_` a Stripe devolve um **copia e cola fictício**: nenhum banco aceita, de propósito, e a tela
do Pix mostra o aviso "Pix de teste". Para simular o pagamento, aponte a câmera do celular para o QR
code: ele abre a página de teste da Stripe, onde se autoriza ou expira o pagamento. Para o webhook chegar
na sua máquina:

```bash
stripe listen --forward-to localhost:3000/api/pagamentos/webhook   # mostra o whsec_ do STRIPE_WEBHOOK_SECRET
```

Sem o webhook, a tela ainda confirma sozinha: a consulta de status (a cada 3 s) pergunta à Stripe.

Para um **Pix de verdade**, que qualquer banco paga (dinheiro real), só na Vercel, em Production:

1. A conta da Stripe ativada no Brasil (dados da empresa e conta bancária) e o Pix ligado em
   Configurações > Métodos de pagamento, no modo **produção**.
2. `STRIPE_SECRET_KEY` com a chave `sk_live_...` (Dashboard > Desenvolvedores > Chaves de API, sem o
   modo de teste). Nunca a coloque no repositório nem no `.env` de desenvolvimento.
3. Um endpoint de webhook **de produção** em `https://<domínio>/api/pagamentos/webhook`, com os eventos
   `payment_intent.succeeded`, `payment_intent.payment_failed` e `payment_intent.canceled`, e o
   `whsec_...` dele em `STRIPE_WEBHOOK_SECRET`.
4. Faça um pagamento pequeno de verdade e confira: a resposta traz `pix.pagavelEmBanco: true`, o app do
   banco lê o QR, e a reserva fica `CONFIRMADA`. Para devolver, estorne pelo painel da Stripe.

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

Para ver o app como ele roda em produção, use `npm run build` e depois `npm start`. Nesse modo o app exige
também `APP_URL` e `PAGAMENTO_MODO` no `.env.local` (em desenvolvimento eles têm padrão). Se faltar
alguma variável, **o servidor continua de pé, mas todas as rotas respondem erro 500** (inclusive
`/api/health`), e o motivo aparece só no terminal onde o servidor roda, nunca na resposta.

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

Teste de estresse (com o `npm run dev` rodando, só local ou `dev`, nunca production): tenta quebrar a
API com concorrência, força bruta, tokens forjados e entradas maliciosas, e confere que nunca sai 500,
que duas pessoas não reservam a mesma bicicleta e que a mesma reserva não ganha dois Pix. Cria contas
`estresse.*@bikeilha.test` e cancela as reservas que criou. Só roda contra servidor local (para outro, exige
`ESTRESSE_PERMITIR_REMOTO=sim`). Se o servidor estiver com `sk_live_`, o primeiro Pix sai pagável em banco e o
script para ali: fica no máximo um Pix de verdade, que não deve ser pago e vence em 15 minutos.

```bash
node scripts/teste-de-estresse.mjs          # BASE_URL=http://localhost:3001 para outra porta
```

Os testes do banco (`npm run teste:banco`, dentro de `db/`) rodam na CI, num Postgres descartável.
Localmente, só use um banco de teste que possa ser apagado; combine com o Luis antes de apontá-los
para o Neon `dev`, e **nunca** para production.

## 8. Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `password authentication failed for user 'USUARIO'` | `.env.local` ainda com o texto do modelo | Preencha as conexões reais (passo 3). |
| Login dá erro 500 | `SESSION_SECRET` ausente, curto ou igual ao exemplo | Gere um valor novo e reinicie o `npm run dev`. |
| Aparece "Configuração do ambiente inválida" no terminal e todas as páginas e rotas dão erro 500 | Falta ou está errada uma variável da tabela acima (em production, também `APP_URL` e `PAGAMENTO_MODO`) | O servidor segue de pé, mas responde 500 em tudo. A mensagem do terminal lista cada variável com o problema, sem mostrar o valor. Corrija o `.env.local` e **reinicie** o servidor. |
| `criar-equipe` recusa a conexão | `DATABASE_URL_UNPOOLED` com `-pooler` | Use a conexão direta, sem `-pooler`. |
| Erro com arquivos `.ts` ao rodar scripts ou testes | Node anterior a 22.18 | Instale o Node 22 LTS (`node -v`). |
| Aviso `MODULE_TYPELESS_PACKAGE_JSON` | Node importando `.ts` do app | Só informativo, pode ignorar. |
| Avisos `LF will be replaced by CRLF` no Git | Quebra de linha do Windows | Inofensivo; use `git add` com os caminhos dos arquivos. |
| `npm run dev` não pega mudança do `.env.local` | Variáveis são lidas na subida | Pare com Ctrl+C e suba de novo. |
| Pagar dá erro (502) | `STRIPE_SECRET_KEY` ausente | Coloque a chave de teste da Stripe e reinicie. |
| O banco diz que o Pix copia e cola não existe | Chave de **teste** da Stripe: o código é fictício | Normal no teste (simule pelo QR). Pix de verdade só com `sk_live_` (veja "Pix: teste x de verdade"). |
| Falha no build ao baixar a fonte do Google | Falha de rede passageira | Rode de novo. |

## 9. Deu certo se...

- [ ] `node -v` mostra 22.18 ou mais novo.
- [ ] `/api/health` responde e `/api/health/db` mostra o banco.
- [ ] O login do admin leva ao painel da plataforma e o do operador, ao painel da equipe.
- [ ] `npm run lint`, `npm run typecheck` e `npm test` passam.
- [ ] `git status` não mostra `.env.local`.
