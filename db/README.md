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

> **Novo escopo (uma única locadora).** A migration `0003` ainda segue o modelo anterior, com
> segurança por locadora. Na fase 1 do plano (`docs/mudanca-de-escopo.md`) a migration `0004` passa o
> critério para o cliente: `comSessao` declarará o perfil e o usuário, e não mais a locadora.

## Esquema atual

Veja `docs/modelo-de-dados.md`.
