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

As consultas de locadoras e pontos devem passar por `comSessao` (`src/shared/db/sessao.ts`), que
declara perfil e locadora dentro de uma transação para as políticas valerem.

> **Uma única locadora.** A migration `0004` leva o banco do modelo anterior (várias locadoras) para o
> modelo atual: tabela `empresa` com uma linha só, perfis `CLIENTE`, `OPERADOR` e `ADMIN`, sem
> `locadora_id`. A segurança por linha passa a olhar o perfil e o usuário da sessão
> (`sessao_perfil()` e `sessao_usuario_id()`), e o `comSessao` do app deve declarar
> `app.perfil` e `app.usuario_id`. A `0005` cria o catálogo (`tipo_bicicleta` e `bicicleta`).

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

## Esquema atual

Veja `docs/modelo-de-dados.md`.
