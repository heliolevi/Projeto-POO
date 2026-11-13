# Plano de migração para Orientação a Objetos (sem quebrar o MVP)

> Substitui a versão anterior deste arquivo, que partia de uma base desatualizada. **Este documento é só plano: nada aqui foi implementado.** Execução com `superpowers:executing-plans` ou `superpowers:subagent-driven-development`, depois da aprovação do Luis.

## 0. Decisões do Luis em 12/11/2026 (valem mais que o resto deste documento)

1. **O PR #45 não é mesclado como está.** Ele é reformulado em classes (`Reserva`, estados, `ReservaService`) e só depois entra na `dev` (task T35, em 17/11). Isso substitui a recomendação da seção 4, fase 0, item 3.
2. **Não há refatoração até o MVP (13/11).** Ela acontece de 16 a 19/11, com congelamento final em 18/11, às 18:00.
3. **O `Admin` herda direto de `Usuario`** (como no diagrama), não de `Operador`.
4. **O trabalho local antigo (`refactor/poo-contas`) foi descartado.** Ele estava numa base 109 commits atrás da `dev`. O refazimento parte da `dev` atual.
5. **Prazos:** MVP da interface em **13/11**; sistema completo, em orientação a objetos, em **19/11**.

### Consequência: o MVP de 13/11 e o PR #45

As telas de reserva, Minhas reservas e pagamento já estão na `dev`, mas chamam `/api/reservas`, que só existe no #45. Como o #45 não entra na `dev` agora, a demonstração de 13/11 roda numa **branch de demonstração** (`demo/mvp-2026-11-13` = `dev` + #45), com deploy na Vercel. Essa branch **não** é mesclada na `dev` e é descartada depois da entrega do MVP.

O que funciona em 13/11: cadastro, login, perfil, busca com recomendação, reserva e Minhas reservas. As telas de pagamento, operação e painel aparecem sem API (as rotas entram em 18/11) e precisam mostrar uma mensagem clara, não uma tela quebrada (T69).

### Cronograma

O cronograma vigente está na planilha `docs/cronograma-entrega-19-11.xlsx` e em `docs/andamento-do-projeto.md` (atualizado em 13/11/2026, 00:00). Ele substitui qualquer tabela de datas anterior neste documento.

As seções 4 e 6 abaixo ficam como referência da análise original; onde divergirem, valem esta seção 0 e a planilha.

Mudanças de responsável para equilibrar a carga: T48 (painel do catálogo) e T49 (painel de operação) passam para o Renan, e o Hélio concentra o back-end. Se o prazo apertar, corte nesta ordem: R6, T56, T37, T36.

**Objetivo:** fazer o código seguir o diagrama de classes do projeto (`docs/diagrama-de-classes.pdf`, páginas 3 e 4) com classes, encapsulamento, herança, polimorfismo e abstração, **sem mudar o que o MVP faz** (API, banco, telas) e **sem descartar** o que já foi entregue.

**Referências:** planilha "Sprint MVP v2 - Daily Tracker", PRs do GitHub (estado de 12/11/2026), `docs/contrato-api-mvp.md`, `docs/modelo-de-dados.md`, `docs/estrategia-de-commits.md`.

---

## 1. Diagnóstico

1. O código atual é **modular e em camadas** (`domain`, `application`, `infrastructure`, `http`), mas **funcional**: entidades são `type`, casos de uso são funções ou fábricas (`criarCatalogo(deps)`, `criarBuscarRecomendacoes(deps)`, `criarPerfilCiclista(deps)`), repositórios são objetos ou funções soltas. Só há classes nos erros (`AppError` e subclasses).
2. A injeção de dependência **já existe** (por fábricas). Isso ajuda muito: a migração é, na maior parte, **trocar a forma** (fábrica → classe com construtor) sem mudar a lógica.
3. As regras de negócio já estão isoladas em `domain/` e cobertas por testes. Esses testes são a **rede de segurança** da refatoração.
4. **A `dev` está 109 commits à frente da minha branch `refactor/poo-contas`.** Aquele trabalho foi feito sobre um `contas` antigo (sem `perfil-ciclista`, sem `ContaLogada`). Ele serve como **modelo de estilo**, mas precisa ser refeito sobre a `dev` atual. Nada dele vai direto para PR.
5. Existem **7 PRs abertos** (#45, #47, #51, #52, #53, #54, #55). Refatorar por cima deles gera conflito e retrabalho: a ordem importa (seção 4).

## 2. Princípios (como não quebrar nem jogar trabalho fora)

1. **Strangler, um módulo por PR.** Cada PR converte um módulo inteiro e termina com a `dev` verde. Se um módulo não ficar pronto, os outros continuam valendo.
2. **Comportamento congelado.** Rotas, contrato JSON, migrations, SQL e telas não mudam. Os testes existentes devem passar **sem edição de asserções**; só muda como o objeto é construído (`new X(...)` no lugar de `criarX(...)`).
3. **Reaproveitar, não reescrever.** O corpo de cada função vira corpo de método. As validações (`validacao.ts`) ficam como funções puras de apoio.
4. **Nada de big bang.** Antes de tocar num módulo, ele precisa ter testes; se faltar, o primeiro commit do PR só acrescenta o teste de caracterização.
5. **Frente do Renan intacta.** `src/shared/ui`, `src/app/**/page.tsx` e os tipos de tela (`shared/reservas`, `shared/busca`, `shared/pagamentos`...) não entram na refatoração. As telas continuam falando com a API.
6. **Sem migrations novas** por causa da refatoração.
7. **Nova regra de estilo OO** (vira `docs/arquitetura-oo.md`, seção 7).

## 3. Reconciliação: tasks × PRs (estado real em 12/11)

Legenda: **Feito** = PR mesclado; **Em andamento** = PR aberto; **Pausado** = sem PR por bloqueio; **Não iniciado** = sem PR.

### Feitas (a planilha pode estar desatualizada)

| Task | PR | Observação |
|---|---|---|
| T02 contrato da API | #11 | ok |
| T03 lockfile npm 10 | #13 | ok |
| T04 PR do Renan (gestão da conta) | #9 | ok |
| T05 função de recomendação | #14 | ok |
| T06 plano de testes | #20 | ok |
| T07 dados da locadora | #21 | ok |
| T08, T09, T10 banco (inventário, 0004, 0005) | #4, #5, #12 | ok |
| T11 contas e `exigirPerfil` | #15 | ok |
| T12 tokens do design system | #18 | ok |
| T13 base visual e navegação | #19, #31 | ok |
| T14 CI | #32 | proteção da `dev` depende do Hélio ligar (confirmar) |
| T15 revisão do dia 1 | n/a | ok |
| T17 migration 0006 | #16 | ok |
| T18 API do catálogo | #28, #41 | ok |
| T19 perfil do ciclista | #27, #35, #40 | ok |
| T21 regra de preço | #26 | ok |
| T22 API de recomendação | #29, #37 | ok |
| T24 componentes do design system | #42 | ok |
| T25 tela de perfil do ciclista | #43 | ok |
| T26 formatação | #25 | ok |
| T27 tela de busca | #44 | ok |
| **T30** índices, expiração e CHECKs | #30 (0008, 0009) | planilha diz "Esperando Review", mas já está mesclado: **concluída** |
| **T34** migration movimentacao | #34 | planilha diz "Em andamento", mas está mesclado: **concluída** |
| **T38** confirmação e Minhas reservas | #38, #46 | planilha diz "Em andamento", mas as duas partes estão mescladas: **concluída** |
| T39 tela de pagamento Pix | #39 | ok |
| T42 termos e privacidade (texto) | #33, #36 | versão atual `2026-11` |
| T50 acabamento | #49 | já mesclado (era da Sprint 4) |
| T57 landing | #48 | já mesclado |
| T62 apresentação | #50 | `.pptx` mesclado; precisa de um slide de OO (T87) |

### Em andamento (PR aberto)

| Task | PR | Situação | Efeito na refatoração |
|---|---|---|---|
| **T35 API de reservas** | #45 (Luis) | CI verde; William pediu mudanças: conflitos em `docs/`, número de migration duplicado (já virou 0011), texto do plano de testes | **Mesclar antes**; reservas vira OO no PR de reservas (seção 5) |
| T28 script `criar-equipe` | #47 (William) | aprovado, CI verde; falta validar com `app_login` | não toca em `src/`; sem impacto |
| T58 termos e privacidade (telas) | #51 (Luis) | aprovado, CI verde | só front e `shared/markdown`; sem impacto |
| T59 tela Minha conta | #52 (Luis) | CI verde, falta review | só front e `shared/conta`; sem impacto |
| T47 revisão de segurança | #53 (Luis) | aprovado, CI verde | só `next.config.ts` e teste; sem impacto |
| T31 guia de ambiente local | #54 (William) | aprovado | só doc |
| (decisão de escopo) MVP sem Mercado Pago | #55 (Luis) | CI com **1 falha**, review pendente | só `README`/docs; resolver antes de mexer nos `.md` |
| T52 checagem de segurança final | sem PR | William em andamento | n/a |
| T41 teste de concorrência | parte em #45 | parte dos testes está no #45 | acompanhar o #45 |

### Pausadas

| Task | Motivo | Plano |
|---|---|---|
| T20 conta sandbox do Mercado Pago | site de desenvolvedores fora do ar | por causa do #55 (MVP sem Mercado Pago), vira **follow-up pós-MVP** |
| T36 cobrança Pix | depende de T20 | reescrita como `PagamentoService` com `GatewaySimulado` (seção 6) |
| T37 webhook | depende de T36 | idem; idempotência e assinatura continuam como critério |

### Não iniciadas (Sprint 4 e marco final)

T23, T29, T40, T43, T45, T46, T48, T49, T51, T53, T54 (a constante já saiu no #36; falta confirmar a validação no servidor), T55, T56, T60, T61, T63, T64, T65, T66 a T77. As que mexem em backend ou domínio (T45, T46, T48, T54, T55, T56) **nascem já em OO** (seção 6), para não criar código novo que depois precisaria ser refatorado.

## 4. Ordem de execução (sem retrabalho)

**Fase 0: estabilizar (hoje, até as 18:00, code freeze)**
1. Mesclar os PRs que não tocam em `src/modules`: **#53, #51, #47, #54** (todos aprovados e verdes).
2. Resolver a falha de CI do **#55** e decidir se entra (é só documentação do escopo).
3. Resolver os pedidos do William no **#45**: trazer a `dev` para a branch, confirmar a numeração da migration e ajustar o texto do plano de testes. Mesclar o #45 **como está (funcional)**: ele já passou nos testes de concorrência, e refatorar dentro dele atrasaria a T35, que é P0.
4. **#52** (Minha conta) mescla quando for aprovado; também não toca em módulos.
5. Criar a tag `v0.1.0-mvp.dev` antes de começar a refatoração. Ela é o ponto de volta (rollback).

**Fase 1: refatoração, um PR por módulo, a partir da `dev` nova** (ordem pelo risco e pelas dependências)

| PR | Módulo | Dono | Depende de |
|---|---|---|---|
| R1 | `shared`: `Periodo`, `TabelaDePrecos`, `Cpf`, `Dinheiro` (objetos de valor) | Luis | Fase 0 |
| R2 | `contas`: `Usuario`, `Cliente`, `Operador`, `Admin`, serviços | Luis | R1 (usa `Cpf`) |
| R3 | `reservas`: `Reserva`, estados, `ReservaService` | Luis, revisão do Hélio | R1 e #45 |
| R4 | `catalogo`: `TipoBicicleta`, `Bicicleta`, `CatalogoService` | Hélio | R1 |
| R5 | `recomendacao`: `RecomendacaoService` | Hélio | R1, R3 |
| R6 | `pagamentos`, `operacao`, `notificacoes`, `empresa` (classes novas, já em OO) | Hélio | R3 |
| R7 | Documentação, diagrama, apresentação (T63, T65, T87) | Luis, William, Renan | R2 a R6 |

**Regras de corte**
- Cada PR só mescla com `lint`, `typecheck`, `test`, `build` e o **teste de banco** verdes e com o E2E da T60 passando (quando existir).
- **Último merge de refatoração: sexta 13/11, 08:00.** O smoke test do William é às 08:30 e não pode ser feito sobre código que ainda mexe.
- O que não estiver mesclado até lá **não entra** na entrega; fica documentado como "modelado, ainda não migrado". Como os PRs são independentes, nada trava.

## 5. Mapa do diagrama para o código (o que reaproveitar)

| Classe do diagrama | Arquivo novo | De onde vem (reaproveita) | Teste que protege |
|---|---|---|---|
| `Usuario` (abstrata), `Cliente`, `Operador`, `Admin` | `contas/domain/usuario.ts` | `domain/usuario.ts` (tipos, `PERFIS`), `ContaLogada`, `PerfilCiclistaConta` | `usuario.test.ts` + os de `contas` |
| (casos de uso de contas) | `contas/application/*.ts` como classes: `CadastrarCliente`, `Autenticar`, `AlterarSenha`, `AtualizarAltura`, `DesativarConta`, `AceitarTermos`, `PerfilCiclistaService`, `ExigirSessao` | funções e `criarX(deps)` atuais | `alterar-senha.test.ts`, `exigir-sessao.test.ts`, etc. |
| `Repositorio*` | interface em `domain/portas.ts` + `Repositorio...Pg` em `infrastructure` | `repositorio-usuarios.ts` | testes dos casos de uso (com repositório em memória) |
| `Periodo` | `shared/dominio/periodo.ts` | `validarBusca`/`lerData` (que o #45 já moveu para `shared`) | `periodo.test.ts` |
| `Reserva` (`confirmar`, `cancelar`, `iniciar`, `concluir`, `estender`, `calcularValor`, `estaAtrasada`) + estados | `reservas/domain/reserva.ts`, `estado-reserva.ts` | `podeCancelar`, `calcularExpiraEm`, `STATUS_RESERVA` do #45 | `reserva.test.ts` (#45) |
| `ReservaService` (`criarReserva`, `verificarConflito`, `cancelarReserva`, `expirarPendentes`) | `reservas/application/reserva-service.ts` | `criar-reserva.ts`, `cancelar-reserva.ts`, `consultar-reservas.ts`, `portas.ts` do #45 | `criar-reserva.test.ts`, `consultar-e-cancelar.test.ts`, testes de banco |
| `Bicicleta` (`estaDisponivel`, `bloquear`, `liberar`) | `catalogo/domain/bicicleta.ts` | `BicicletaAdmin`, `validacao.ts` | testes de `catalogo` |
| `TipoBicicleta` | `catalogo/domain/tipo-bicicleta.ts` | `TipoAdmin`, `paraPublico` | idem |
| `Admin.cadastrarTipo/cadastrarBicicleta` | `CatalogoService` | `criarCatalogo(deps)` | `fabrica-handlers` (401/403) |
| `RecomendacaoService` (`recomendar`, `pontuar`, `motivo`, pesos) | `recomendacao/application/recomendacao-service.ts` | `recomendacao.ts`, `buscar-recomendacoes.ts` | `recomendacao.test.ts` (12+ casos) |
| `TabelaDePrecos` / `calcularValor` | `reservas/domain/tabela-de-precos.ts` | `preco.ts` | `preco.test.ts` (10+ casos) |
| `Pagamento` (abstrata), `PagamentoPix`, `PagamentoCartao`, `PagamentoService` | `pagamentos/domain` e `application` | nada pronto (T36/T37 pausadas) | novos, ver T83 |
| `Movimentacao` (`Retirada`, `Devolucao`), `Ocorrencia` | `operacao/domain` | tabela `movimentacao` (0007) | novos, ver T84 |
| `Notificacao`, canais | `notificacoes/domain` | nada | novos, ver T84 |
| `Empresa` (único registro) | `administracao/domain/empresa.ts` | `shared/landing/locadora.ts` (dados fixos) | novos, ver T55 |
| `Arquivo` | fora do MVP | n/a | só documentado |

Mapa de conceitos para a apresentação:
- **Herança:** `Usuario` → `Cliente`/`Operador`/`Admin`; `Pagamento` → `PagamentoPix`/`PagamentoCartao`; `Movimentacao` → `Retirada`/`Devolucao`; `AppError` e filhas (já existe).
- **Polimorfismo:** `EstadoReserva` e seus estados; `CanalNotificacao` (WhatsApp, e-mail, push); `HasherSenha`; `GatewayPagamento`; permissões por perfil.
- **Encapsulamento:** `#senhaHash`, `#estado` da reserva, `#ativo`; só métodos mudam o estado.
- **Abstração:** interfaces em `portas.ts` (repositórios, hasher, gateway); `container.ts` como única raiz de composição.

## 6. Tasks reescritas (para colar na planilha)

Todas mantêm o critério de pronto antigo **mais** "em classes, conforme `docs/arquitetura-oo.md`". As linhas **R** são as novas.

| ID | Frente | Entrega (reescrita) | Responsável | Prior. | Status proposto | Depende de |
|---|---|---|---|---|---|---|
| T30, T34, T38 | Banco/Frontend | Marcar como **Concluído** (PRs #30, #34, #38 e #46 mesclados) | Luis, Renan | n/a | Concluído | n/a |
| T35 | Backend | Fechar o #45 (conflitos, migration 0011, texto do plano de testes) e mesclar **funcional**; a conversão para `ReservaService` é a R3 | Luis | P0 | Em andamento | n/a |
| T36 | Backend | `PagamentoService` + `PagamentoPix` + `GatewaySimulado` (sem Mercado Pago, conforme #55) | Hélio | P1 | Pausado, depende de R3 | R3 |
| T37 | Backend | Webhook como `PagamentoService.processarWebhook`, idempotente | Hélio | P1 | Pausado, depende de T36 | T36 |
| T45 | Backend | API de operação já em OO: `OperacaoService`, `Retirada`, `Devolucao`, `Reserva.iniciar()/concluir()` | Hélio | P0 | Planejado | R3 |
| T46 | Backend | `verificarToken` exigir `exp` (inalterado, é `infrastructure/token`) | Hélio | P1 | Planejado | n/a |
| T48 | Frontend | Painel do catálogo (inalterado; consome a API) | Hélio | P1 | Planejado | n/a |
| T54 | Backend | Validar versão dos termos: virar `Cliente.aceitarTermos(versao)` | Hélio | P1 | Planejado | R2 |
| T55 | Backend | `GET /api/empresa` com a classe `Empresa` | Hélio | P1 | Planejado | R1 |
| T56 | Backend | Limites de tentativas dentro dos serviços (`ReservaService` etc.) | Hélio | P1 | Planejado | R3 |
| T63 | Projeto | Atualizar o diagrama com as classes **reais** (não só as planejadas) | Hélio, Luis | P1 | Planejado | R2 a R6 |
| T65 | Projeto | Documentação OO (seção 8) | William | P1 | Planejado | R7 |
| T62 | Projeto | Acrescentar um slide de OO à apresentação já mesclada | Renan, Luis | P1 | Planejado | R2 a R6 |
| **R1** | Backend | Objetos de valor `Periodo`, `TabelaDePrecos`, `Cpf`, `Dinheiro` | Luis | P0 | Planejado | Fase 0 |
| **R2** | Backend | `contas` em classes (hierarquia `Usuario`) | Luis | P0 | Planejado | R1 |
| **R3** | Backend | `reservas` em classes (`Reserva`, estados, `ReservaService`) | Luis | P0 | Planejado | R1, #45 |
| **R4** | Backend | `catalogo` em classes | Hélio | P1 | Planejado | R1 |
| **R5** | Backend | `RecomendacaoService` | Hélio | P1 | Planejado | R3 |
| **R6** | Backend | `Pagamento`, `Movimentacao`, `Ocorrencia`, `Notificacao`, `Empresa` | Hélio | P2 | Planejado | R3 |
| **R7** | Projeto | Documentação, diagrama e slide | Luis, William, Renan | P1 | Planejado | R2 a R6 |
| **R8** | QA | Regressão a cada PR (`lint`, `typecheck`, `test`, `build`, banco, E2E) e smoke de sexta 08:30 | William | P0 | Planejado | cada R |

Renan: sem alteração no front; entra na R7 (slide) e revisa se algum tipo de tela depende de algo que mudou de nome.

## 7. Regra de estilo OO do projeto

1. **Sintaxe apagável apenas**, porque os testes rodam com `node --test` direto no TypeScript: nada de `constructor(private x)`, `enum` ou `namespace`. Use atributos explícitos e `#privado`. Uma regra do ESLint (`no-restricted-syntax` para `TSParameterProperty`) impede o erro na CI.
2. Arquivos testados importam com **caminho relativo e extensão** (`"../domain/x.ts"`); `@/` só em `infrastructure`, `http` e `src/app`.
3. **Entidade com estado** é classe com atributos `#privados` e métodos que mantêm as invariantes; **objeto de valor** é classe imutável (`readonly`); **serviço** é classe cujo construtor recebe só interfaces.
4. Interfaces (portas) ficam em `domain/portas.ts` do módulo; implementações em `infrastructure/*-pg.ts`.
5. Cada módulo tem um `http/container.ts` que escolhe as implementações concretas. Fora dele, ninguém faz `new` de infraestrutura.
6. Transição de estado inválida lança `ConflictError` (409) e **não altera** o objeto.
7. Nomes de classes, métodos e atributos seguem o diagrama (português).
8. `index.ts` do módulo continua sendo a única API pública (regra do ESLint já existente).

## 8. Documentação a alterar (todos os `.md` e afins)

| Arquivo | O que muda |
|---|---|
| `README.md` | seção "Arquitetura" com a convenção OO e link para `docs/arquitetura-oo.md`; o texto do #55 (sem Mercado Pago) é resolvido antes |
| `docs/arquitetura-oo.md` (**novo**) | regras da seção 7, mapa da seção 5, exemplos (`Usuario`, `Reserva`) e como criar uma classe nova |
| `docs/andamento-do-projeto.md` | entregue, em refatoração, fora do MVP; estado dos PRs e das tasks da seção 3 |
| `docs/modelo-de-dados.md` | tabela "classe ↔ tabela/coluna" (ex.: `Reserva` ↔ `reserva`, `Movimentacao` ↔ `movimentacao`) |
| `docs/contrato-api-mvp.md` | **sem mudança de comportamento**; só uma nota: "contrato inalterado pela refatoração OO" |
| `docs/estrategia-de-commits.md` | tipo `refactor(<módulo>)`, um módulo por PR, regra de "testes não podem mudar de asserção" |
| `docs/plano-de-testes.md` | casos de regressão da refatoração (CT-POO-xx) e testes de transição de estado |
| `docs/mudanca-de-escopo.md` | registrar a decisão de OO como requisito da disciplina |
| `docs/design-system.md`, `dados-da-locadora.md`, `termos-de-uso.md`, `politica-de-privacidade.md` | sem mudança |
| `docs/diagrama-de-classes.pdf` | regenerar com o que foi **de fato** implementado e marcar o que ficou só modelado (`Arquivo`, `Ocorrencia`, `Notificacao`) |
| `docs/apresentacao-bike-ilha-club.pptx` | slide de OO (herança, polimorfismo, encapsulamento, abstração) |
| `db/README.md`, `.github/workflows/ci.yml` | sem mudança; só o ESLint ganha a regra da seção 7 |

## 9. Riscos e como evitá-los

| Risco | Mitigação |
|---|---|
| Conflito com os PRs abertos | Fase 0 mescla primeiro; R-PRs partem da `dev` atualizada |
| Quebrar o fluxo da demo | testes sem edição de asserção, E2E (T60) e smoke de sexta; tag de rollback `v0.1.0-mvp.dev` |
| Hélio e Luis editando os mesmos arquivos | um dono por PR (tabela da seção 4); ninguém altera `modules/<x>` durante o PR de R-x sem avisar |
| Prazo | cada R é independente; corte às 08:00 de sexta; o que não entrar fica "modelado" na documentação |
| Teste que depende de sintaxe não apagável | regra de ESLint e a seção 7 |
| Falsa sensação de POO só de nome | critério de pronto exige herança/polimorfismo reais (seção 5) e testes dos comportamentos (transições, permissões por perfil) |

## 10. Decisões do Luis (respondidas em 12/11/2026)

1. Mesclar o #45 como está e refatorar depois? **Não**: reformular o #45 em classes antes de mesclar.
2. Corte da refatoração? **Congela**: sem refatoração entre 12 e 13/11; ela acontece de 16 a 19/11.
3. `Admin` herda direto de `Usuario`? **Sim.**
4. Descartar o trabalho local da `refactor/poo-contas`? **Pode.** Foi descartado.
