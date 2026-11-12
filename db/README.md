# Banco de dados

PostgreSQL (Neon) com PostGIS. O esquema é versionado em scripts SQL na pasta `migrations/`,
aplicados em ordem pelo `migrar.mjs`.

## Como usar

A conexão é lida do `.env.local` ou do `.env` na raiz do projeto (veja `.env.example`). Para migrations, use a
conexão direta, sem pool: `DATABASE_URL_UNPOOLED`.

```bash
cd db
npm install

npm run migrar:simular   # executa tudo e desfaz no final, para conferir se o SQL roda
npm run migrar           # aplica as migrations pendentes
npm run migrar:status    # mostra o que já foi aplicado
npm run migrar:reverter  # desfaz a última migration aplicada
```

O runner mostra o host do banco antes de agir. Confira se é o branch certo.

## Como funciona

- Cada arquivo é `NNNN_descricao.sql` e tem duas seções: `-- migrate:up` (aplica) e
  `-- migrate:down` (desfaz).
- O banco guarda o que já rodou na tabela `schema_migrations`. Só as pendentes são aplicadas, e cada
  uma roda dentro de uma transação: se algo falhar, nada fica pela metade.
- Não edite uma migration que já foi aplicada. Crie outra (`0002_...`) com a alteração. O runner
  avisa se detectar que um arquivo mudou depois de aplicado.

## Papel do aplicativo (RLS)

A migration `0003` cria o papel `app_backend`, sem login e sem `BYPASSRLS`, com as permissões que o
app precisa. O dono do banco (`neondb_owner`) ignora a segurança por linha, então o app **não deve**
conectar com ele. O papel com login e senha não fica no repositório; crie um por banco (dev e
production), no Editor SQL do Neon, com uma senha forte gerada por você:

```sql
CREATE ROLE app_login LOGIN PASSWORD '<senha-forte>' IN ROLE app_backend;

-- confira: rolbypassrls precisa ser false
SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = 'app_login';
```

Crie o papel por SQL, e não pelo botão de roles do console, que costuma dar `BYPASSRLS`. Depois:

- **`DATABASE_URL`** (app e Vercel): usuário `app_login`, host com `-pooler`.
- **`DATABASE_URL_UNPOOLED`** (migrations): continua com o dono do banco.

As consultas às tabelas com segurança por linha devem passar por `comSessao`
(`src/shared/db/sessao.ts`), que declara `app.perfil` e `app.usuario_id` dentro de uma transação para
as políticas valerem. A rota repassa a sessão do `exigirSessao` direto
(`comSessao(sessao, (c) => c.query(...))`); visitante usa `VISITANTE`.

> **Uma única locadora.** A migration `0004` leva o banco do modelo anterior (várias locadoras) para o
> modelo atual: tabela `empresa` com uma linha só, perfis `CLIENTE`, `OPERADOR` e `ADMIN`, sem
> `locadora_id`. A segurança por linha passa a olhar o perfil e o usuário da sessão
> (`sessao_perfil()` e `sessao_usuario_id()`), que o `comSessao` do app declara
> (`app.perfil` e `app.usuario_id`). A `0005` cria o catálogo (`tipo_bicicleta` e `bicicleta`).

## Dados de exemplo (seed)

`seeds/dev.sql` cria uma empresa fictícia, um ponto de retirada em São Luís, 6 tipos de bicicleta,
14 unidades e as contas `admin@bikeilha.test` e `operador@bikeilha.test`. Serve só para o
**desenvolvimento** e pode rodar várias vezes (atualiza em vez de duplicar).

As senhas da equipe **não ficam no Git**. Coloque no seu `.env.local` (que o Git ignora):

```
SEED_ADMIN_SENHA=<senha de teste do admin>
SEED_OPERADOR_SENHA=<senha de teste do operador>
```

Cada senha precisa ter 8 caracteres ou mais, com letra e número. Depois, com `DATABASE_URL_UNPOOLED`
apontando para o branch **dev** do Neon:

```bash
cd db
npm run seed:dev -- --ok-dev
```

O script imprime o host, gera o hash das senhas com a mesma função do app e aplica o seed numa
transação. A flag `--ok-dev` é uma confirmação: confira o host antes e **nunca rode em production**.

## Contas da equipe (ADMIN e OPERADOR)

Não há tela para criar a equipe da locadora: os clientes se cadastram pelo app, mas as contas de
administrador e de operador são criadas por um script. Na raiz do projeto:

```bash
npm run criar-equipe
```

O script pergunta o perfil (`ADMIN` ou `OPERADOR`), o nome, o e-mail e a senha. A senha é digitada em
um prompt oculto, nunca por argumento, para não ficar no histórico do terminal. Ele gera o hash com a
mesma função do app (scrypt), mostra o host do banco e só grava depois de você digitar `sim`.

- **Conexão:** lê `DATABASE_URL_UNPOOLED` do ambiente, do `.env.local` ou do `.env`.
- **Regras:** a senha tem de 8 a 128 caracteres, com letra e número. O e-mail é gravado em minúsculas.
  Um e-mail já cadastrado é recusado e nada é gravado.
- **Operador:** com um único ponto de retirada ativo, o operador já fica ligado a ele.
- **Production:** só rode com a autorização do tech lead. Confira o host que o script mostra antes de
  confirmar.
- **Seed:** as contas `admin@bikeilha.test` e `operador@bikeilha.test` continuam vindo do seed de
  desenvolvimento (veja "Dados de exemplo"); o script serve para criar as contas reais da equipe.

## Esquema atual

Veja `docs/modelo-de-dados.md`.
