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

## Esquema atual

Veja `docs/modelo-de-dados.md`.
