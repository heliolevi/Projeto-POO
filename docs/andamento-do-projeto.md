# Andamento do projeto

Registro do que a equipe entregou entre 28/09/2026 e 28/10/2026, com base no histórico do Git, nos
pull requests e no relatório de validação do backend. Escrito em 28/10/2026 e atualizado em
novembro de 2026 com a mudança de escopo.

> **Mudança de escopo (novembro de 2026).** O projeto deixou de ser uma plataforma com várias
> locadoras e passou a atender uma única locadora. Este documento registra o que foi entregue sobre o
> modelo anterior; os trechos que mencionam locadoras, comissão, `ADMIN_PLATAFORMA` ou isolamento
> entre locadoras descrevem o estado antigo e serão ajustados na fase 1 do plano. O novo escopo e o
> plano estão em [mudanca-de-escopo.md](mudanca-de-escopo.md).

## Situação em 12/11/2026 e cronograma até 19/11

> **Decisões de 12/11/2026.** (1) O projeto é da disciplina de POO, então o código passa para
> orientação a objetos, conforme o diagrama de classes ([arquitetura-oo.md](arquitetura-oo.md)).
> (2) **MVP mínimo em 13/11** (experiência do cliente) e **sistema completo em 19/11**. (4) O PR #45 (reservas) é reformulado em classes antes de entrar na `dev`.

### Tasks e pull requests

| Situação | Tasks (PR) |
|---|---|
| Concluídas | T02 (#11), T03 (#13), T04 (#9), T05 (#14), T06 (#20), T07 (#21), T08 a T10 (#4, #5, #12), T11 (#15), T12 (#18), T13 (#19, #31), T14 (#32), T17 (#16), T18 (#28, #41), T19 (#27, #35, #40), T21 (#26), T22 (#29, #37), T24 (#42), T25 (#43), T26 (#25), T27 (#44), T30 (#30), T34 (#34), T38 (#38, #46), T39 (#39), T42 (#33, #36), T50 (#49), T57 (#48), T62 (#50) |
| Em andamento (PR aberto) | T35 (#45, será reformulado em classes), T28 (#47), T58 (#51), T59 (#52), T47 (#53), T31 (#54), decisão de escopo sem Mercado Pago (#55) |
| Pausadas | T20 (Mercado Pago fora do ar), T36 e T37 (pagamento e webhook, passam a usar gateway simulado) |
| Não iniciadas | T23, T29, T40, T43, T45, T46, T48, T49, T51, T53, T54, T55, T56, T60, T61, T63, T64, T65, T66 a T77, mais as tasks R1 a R8 da migração para classes |

### Dois objetivos

- **Sex 13/11, MVP mínimo:** mostrar a experiência do cliente para apresentar a ideia (entrar, informar altura e passeio, ver as bicicletas recomendadas, reservar, pagar com Pix simulado e ver a reserva confirmada). Sem painel da equipe. **Precisa estar online, com URL pública** (hoje não existe nenhum deploy). Estado das telas testado em 13/11: a landing, a busca e o resumo da reserva funcionam; quebram o botão "Reservar e pagar", Minhas reservas e o Pix (faltam as APIs de reservas e de pagamento) e o Início do app está vazio.
- **Qui 19/11, sistema completo:** todas as regras funcionando e testadas, com o código em orientação a objetos conforme o diagrama de classes.

### Cronograma

| Quando | O que acontece |
|---|---|
| Qui 12/11 à noite até Sex 13/11 07:30 | Branch de demonstração `demo/mvp-2026-11-13` (`dev` + #45 + #52), migration 0011 no Neon dev, pagamento Pix simulado (API), Início do app sem "em construção", mensagens e estados vazios, dados da demo (cliente Maria) e **deploy na Vercel com URL pública** |
| Sex 13/11 08:30 e 09:00 | Smoke test (William) e decisão Go/No-Go (Luis): Plano A (jornada completa), B (até a reserva criada) ou C (vídeo e prints) |
| Sex 13/11 | **Apresentação do MVP.** À tarde: limpar os PRs abertos e abrir issues dos defeitos vistos na demo |
| Sáb 14 e Dom 15 | Sem tarefas obrigatórias |
| Seg 16/11 | Regra de lint, objetos de valor, token com expiração, páginas 404 e erro, validação de variáveis |
| Ter 17/11 | Catálogo, contas e reservas em classes (o #45 é reformulado e entra na `dev`); recomendação em classes; painel do catálogo; `GET /api/empresa` |
| Qua 18/11 | Operação, pagamento em classes com webhook idempotente, limites, painel de operação; congelamento final às 18:00; E2E e QA |
| Qui 19/11 | Correções P0 e P1, diagrama, documentação, slide de OO, regressão final, deploy final, ensaio e **entrega do sistema completo** |

O que não estiver pronto no congelamento de 18/11 fica documentado como "modelado, ainda não migrado".
As tarefas, com responsável, prazo e plano B, estão na planilha `docs/cronograma-entrega-19-11.xlsx`
(abas "Por pessoa", "MVP 13-11" e "Sistema 19-11").

## Equipe

| Pessoa | Papel | Conta no GitHub |
|---|---|---|
| Luis Felipe | Tech lead: banco de dados, infraestrutura do banco e revisão de código | `luiscstro` (os commits feitos no computador dele aparecem também como `percyy2021-prog`) |
| Hélio Levi | Desenvolvimento do back-end: aplicação, módulos, contas e conexão com o banco | `heliolevi` |
| William | DevOps e QA: integração contínua e validação do backend | `wirsokk` |
| Renan | Front-end: telas do cliente (cadastro, perfil, busca, reservas e Pix), design system e navegação | `rspgameplay-ui` |

## Linha do tempo

| Data | Quem | Entrega | PR / commit |
|---|---|---|---|
| 28/09 | Luis | Documentação inicial e seção de público-alvo no README | commits na `main` e na `dev` |
| 09/10 | Luis | `.gitignore` e `.env.example` | commit na `dev` |
| 13/10 | Hélio | Projeto Next.js com TypeScript e ESLint, helpers de resposta e erro, estrutura dos módulos | PR #3 |
| 13/10 | William | Workflow de CI (lint, typecheck, testes e build) e gatilho na branch `dev` | 2 commits na `dev` |
| 14/10 | Luis | Schema inicial do banco e runner de migrations (usuário, locadora e ponto) | PR #4 |
| 14/10 | Luis | Catálogo público sem colunas sensíveis e correções no runner | PR #5 |
| 22/10 | Luis | Atualização do Next.js para 16.4.2, que corrige uma falha crítica (RCE) na otimização de imagens | commit na `dev` |
| 22/10 | Hélio | Ajustes pedidos na revisão do PR #3 e conexão do app com o PostgreSQL | PR #3 e PR #6 |
| 23/10 | Hélio | Cadastro e login do cliente | PR #7 |
| 28/10 | William | Relatório de validação do backend (9 achados) | relatório em PDF |
| 28/10 | Luis | Correções dos achados do relatório | PR de validação (este documento acompanha ele) |
| Nov | Luis | Mudança de escopo para uma única locadora: README, modelo de dados e plano de trabalho | branch `docs/escopo-locadora-unica` |

## O que cada pessoa fez

### Luis Felipe

- **Banco de dados:** instância no Neon com PostGIS, branches `dev` e `production`, e o desenho do
  schema inicial (`usuario`, `locadora`, `ponto`) em `db/migrations/0001_schema_inicial.sql`.
- **Migrations:** runner `db/migrar.mjs` (aplicar, simular, reverter e listar) e as migrations `0002`
  (catálogo público e índice) e `0003` (limite de tentativas, visão da equipe e papel `app_backend`).
- **Segurança do banco:** segurança por linha (RLS) em `locadora` e `ponto`, o papel de login do app
  (`app_login`) e a conferência de que a RLS vale de verdade no Neon.
- **Documentação de modelagem:** diagrama de classes (`docs/diagrama-de-classes.pdf`) e
  `docs/modelo-de-dados.md`.
- **Revisão:** revisão do PR #3 do Hélio, com pedidos de ajuste (o histórico mostra que ele já atendeu
  pelo menos três: status de `ok()` e `created()`, script `test` e fronteiras com imports relativos).
- **Dependências:** correção da falha crítica do Next.js.
- **Correções do relatório do QA:** limite de tentativas, camada de sessão, rota de saúde protegida,
  testes e CI das migrations (detalhes abaixo).

### Hélio Levi

- **Base da aplicação (PR #3):** Next.js 16 com TypeScript, ESLint com regra de fronteiras entre
  módulos, divisão em nove módulos (`contas`, `locadoras`, `catalogo`, `busca`, `reservas`,
  `pagamentos`, `operacao`, `administracao`, `notificacoes`) e a camada compartilhada em
  `src/shared` (respostas HTTP, erros e variáveis de ambiente).
- **Ajustes da revisão:** `ok()` e `created()` deixaram de permitir que o `init` sobrescreva o status;
  script `test` no `package.json`; a regra de fronteiras passou a valer também para imports relativos.
- **Conexão com o banco (PR #6):** pool do `pg` criado só no primeiro uso, rota `/api/health/db` e
  leitura do `.env` pelo runner de migrations.
- **Cadastro e login (PR #7):** módulo `contas` com validação (CPF, data, altura e aceite dos termos),
  senhas com scrypt, token de sessão HS256, rotas `POST /api/auth/cadastro` e `POST /api/auth/login`
  e os primeiros testes automatizados.

### William (DevOps e QA)

- **Integração contínua:** workflow `.github/workflows/ci.yml`, que roda em todo pull request e em
  pushes na `main` e na `dev`: instala as dependências, roda lint, typecheck, testes e build.
- **Validação do backend (28/10):** relatório com leitura completa do código, execução dos testes e
  testes extras do token de sessão. Apontou 10 pontos fortes e 9 achados (4 altos, 2 médios e 3
  baixos). O tratamento de cada achado está na seção seguinte.

## Relatório de validação do backend: o que foi feito

Todos os achados do relatório foram conferidos no código antes de serem tratados. Todos são válidos.

| # | Gravidade | Achado | Situação |
|---|---|---|---|
| 1 | Alta | A RLS não protegia nada | **Parcial.** O papel `app_backend` e o helper `comSessao` existem e a RLS foi verificada no Neon `dev`. Falta trocar a `DATABASE_URL` da Vercel e do branch `production` |
| 2 | Alta | Sem limite de tentativas | **Corrigido.** Limite no login (por IP, por e-mail e IP e por e-mail) e no cadastro (por IP), com resposta 429 e `Retry-After`. Corpo limitado a 16 KiB |
| 3 | Alta | Sem camada de rotas protegidas | **Corrigido.** `exigirSessao` valida o token e confere no banco se a conta está ativa |
| 4 | Alta | `SESSION_SECRET` ausente na Vercel | **Pendente.** Depende de cadastrar a variável na Vercel |
| 5 | Média | `/api/health/db` público | **Corrigido.** Exige `HEALTH_DB_SECRET`; sem a variável, a rota fica desligada (404) |
| 6 | Média | Operador lia comissão e conta de recebimento | **Corrigido.** A equipe lê pela view `locadora_equipe` |
| 7 | Baixa | Diferença de tempo no login | **Corrigido.** O hash falso agora é fixo no código |
| 8 | Baixa | Regras de negócio em aberto | **Pendente.** Decisão da equipe |
| 9 | Baixa | Node, CI e testes | **Corrigido.** `engines` e `.nvmrc`, CI valida as migrations num PostgreSQL com PostGIS, e 51 testes novos |

Além do relatório, o mesmo trabalho corrigiu três pontos que ele não listava: o segredo de exemplo do
`.env.example` passava na validação de tamanho e agora é recusado; o limite por e-mail foi desenhado
para que um estranho não consiga trancar a conta de outra pessoa; e a limpeza de linhas antigas do
limitador agora é aguardada, em vez de rodar solta.

## Estado atual do backend

- **Aplicação:** Next.js 16 em monólito modular, com fronteiras entre módulos impostas pelo ESLint.
- **Rotas:** `GET /api/health`, `GET /api/health/db` (protegida), `POST /api/auth/cadastro` e
  `POST /api/auth/login`.
- **Módulos com código:** apenas `contas`. Os demais têm só a estrutura de pastas.
- **Banco (Neon, PostgreSQL com PostGIS):** tabelas `usuario`, `locadora`, `ponto`,
  `limite_tentativas` e `schema_migrations`; views `locadora_catalogo` e `locadora_equipe`; RLS em
  `locadora` e `ponto`. Detalhes em `docs/modelo-de-dados.md`.
- **Testes:** 8 na `dev` antes do PR de validação e 59 com ele, além do roteiro de migrations na CI.
- **Reservas no banco (migrations 0005 a 0009, revisão de 10/11/2026):** catálogo (`tipo_bicicleta`,
  `bicicleta`), `reserva` e `pagamento`, com a exclusion constraint contra reservas sobrepostas. A
  revisão da 0006 gerou a 0008 (período finito, `atualizado_em`, índice `(cliente_id, status)`,
  `expirar_reservas_vencidas()`) e a 0009 (`unidades_livres_por_tipo()`, que corrige a disponibilidade
  distorcida pela RLS). A consulta de disponibilidade roda em cerca de 0,25 ms com 200 bicicletas e
  2.000 reservas (`cd db && npm run perf:recomendacao`, banco local descartável). 70 testes de banco.

## Pendências

| Item | Responsável | Observação |
|---|---|---|
| Cadastrar `SESSION_SECRET` na Vercel, com valores diferentes em Preview e Production | A definir (DevOps ou tech lead) | Sem ela, login e cadastro respondem 500 no primeiro deploy |
| Cadastrar `HEALTH_DB_SECRET` na Vercel, se a rota `/api/health/db` for usada | A definir | Opcional |
| Criar o papel `app_login` no branch `production` do Neon, aplicar a migration `0003` e trocar a `DATABASE_URL` da Vercel | Tech lead | Passo a passo em `db/README.md`. A migration `0004` do novo escopo manterá o papel `app_backend` |
| Decidir idade mínima para alugar, confirmação de e-mail e a mensagem de e-mail ou CPF já cadastrado | Equipe | Achado 8 do relatório |
| ~~Combinar o que o operador pode ver das finanças da locadora~~ | Cancelada | Deixa de existir com uma única locadora (sem comissão nem repasse) |
| Usar `exigirSessao` e `comSessao` nas rotas dos próximos módulos | Hélio e demais desenvolvedores | Já estão prontos, mas ainda nenhuma rota os usa |
| Chamar `expirar_reservas_vencidas()` antes de **criar** e de listar reservas e agendar uma chamada periódica | Hélio e demais desenvolvedores | **Pré-requisito da task de reservas** (CT-RES-17): a exclusion constraint só libera a pendente vencida quando o status muda, então sem isso `POST /api/reservas` daria 409 falso. A busca de recomendação (`GET /api/recomendacao`) já a chama antes de contar as unidades livres |
| Calcular `unidadesLivres` da recomendação com `unidades_livres_por_tipo()` e não com consulta direta | Hélio e demais desenvolvedores | A consulta direta fica errada para o cliente por causa da RLS |
| Conferir no Neon `dev`, antes de aplicar a 0008: `SELECT count(*) FROM reserva WHERE upper_inf(periodo) OR lower_inf(periodo)` | Tech lead | Se der mais que 0, corrigir essas linhas antes; a constraint `reserva_periodo_finito` as recusaria |
| Nova validação quando reservas, pagamentos e catálogo existirem | William | A regra de reservas sobrepostas, o isolamento entre clientes (RLS por cliente) e o Mercado Pago ainda não foram validados |
| Executar o plano do novo escopo (fases 1 a 6) | Equipe | Veja `docs/mudanca-de-escopo.md`; a fase 1 simplifica o banco e o código |
| Confirmar com a locadora o número de pontos, os dados da empresa e os critérios da recomendação | Equipe | Decisões em aberto em `docs/mudanca-de-escopo.md` |

## Referências

- `docs/arquitetura-oo.md`: regras de orientação a objetos, mapa das classes do diagrama e como criar uma classe nova.
- `docs/superpowers/plans/2026-11-12-refatoracao-poo.md`: plano da migração para classes.

- `docs/mudanca-de-escopo.md`: o que mudou ao passar para uma única locadora e o plano de trabalho.
- `docs/modelo-de-dados.md`: modelo de dados novo (uma locadora), recomendação e segurança por linha.
- `docs/diagrama-de-classes.pdf`: diagrama de classes do modelo de uma única locadora (novembro de 2026); a task T63 o atualiza com o que foi implementado.
- `db/README.md`: como aplicar migrations e criar o papel do aplicativo.
- Relatório de validação do backend (PDF entregue pelo William em 28/10, ainda não versionado).

O uso de assistentes de IA em cada entrega é declarado na seção "Uso de IA" do respectivo pull request.
