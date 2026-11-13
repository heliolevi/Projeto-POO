# Plano de testes e checklist de aceite

Plano de testes do Bike Ilha Club (uma locadora), com os casos de teste por módulo e o checklist de
aceite por tela. Foi escrito a partir do [contrato da API](contrato-api-mvp.md), do
[modelo de dados](modelo-de-dados.md), das fases de [mudanca-de-escopo.md](mudanca-de-escopo.md) e dos
testes que já existem no repositório. Mantido por William (DevOps e QA).

> **Como ler o status.** Os casos ligados a rotas que ainda não existem ficam como `Aguarda rota` ou
> `Aguarda fase N` e serão executados quando o código entrar na `dev`. `Automatizado` quer dizer que já
> existe teste no repositório. `Em revisão (PR #n)` quer dizer que o código e o teste estão em um PR
> ainda aberto.

## 1. Objetivo e escopo

- Garantir que o MVP (sexta, 13/11/2026) funcione de ponta a ponta: cadastro, login, catálogo,
  recomendação, reserva, pagamento por Pix e operação de retirada e devolução.
- Dar à equipe uma lista única do que foi testado, do que falta e do que está quebrado.
- **Dentro do escopo:** as 27 rotas do contrato, o banco (migrations 0004 a 0011), a CI e as telas do MVP.
- **Fora do escopo:** cartão de crédito e débito, estorno de pagamento, assinaturas e créditos, ocorrências
  (dano, furto, atraso), fotos e notificações. Nada disso está no contrato do MVP e fica para uma fase
  posterior (os casos de avisos e auditoria estão na seção 4.13, só como lembrete).

## 2. Como usar

**Prioridade** (a mesma do plano da equipe):

| Prioridade | Significado |
|---|---|
| P0 | Bloqueia o MVP. Se falhar, não vai para a demonstração |
| P1 | Importante. Deve funcionar, mas tem alternativa para a demo |
| P2 | Desejável. Pode ficar para depois |

**Tipo:** `Auto` (teste automatizado no repositório), `Manual` (executado por uma pessoa seguindo o
passo a passo) ou `Integração` (precisa do banco e, quando for o caso, do sandbox do Mercado Pago).

**Status:** `Automatizado`, `Em revisão (PR #n)`, `Pendente`, `Aguarda rota`, `Aguarda fase N`, `Passou`,
`Falhou` ou `Bloqueado`. `Automatizado` quer dizer que a regra tem teste no repositório (em geral de uma
função ou do banco); o caminho completo pela rota só é provado nos casos do tipo `Integração`. Ao executar um caso manual, troque para `Passou` ou `Falhou` e registre a data e o
PR ou issue do defeito.

**Erros esperados** seguem o formato do contrato: `{ "error": { "code", "message", "details" } }`, com
`details` só nos erros de validação (400).

## 3. Ambiente de teste

| Item | Como deve ser |
|---|---|
| Node e npm | Node 22 e npm 10, os mesmos da CI (`.nvmrc`) |
| Instalação | `npm ci` (nunca `npm install` para validar) |
| Checagens | `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` |
| Testes do app | `npm test` na raiz roda só `src/**/*.test.ts` |
| Testes de banco | `cd db && npm run teste:banco`, com PostgreSQL com PostGIS. Rodam na CI (serviço de banco do workflow); localmente precisam de `DATABASE_URL_UNPOOLED`, e o teste de RLS precisa que o dono do banco consiga assumir o papel `app_backend` |
| Banco de desenvolvimento | Branch `dev` do Neon, populado por `db/seeds/dev.sql`. **Nunca** testar no branch `production` fora do combinado com o tech lead |
| Migrations | `cd db && npm run migrar:simular` antes de aplicar qualquer migration |
| Pagamentos | Conta de teste (sandbox) do Mercado Pago, ou `PAGAMENTO_MODO=simulado` em desenvolvimento e na demo. Nenhum pagamento real |
| Dados | Dados fictícios ou da locadora, sem dados pessoais reais |
| Variáveis | `.env.local` na máquina (fora do Git). `SESSION_SECRET` obrigatório; `HEALTH_DB_SECRET` opcional; `MP_WEBHOOK_SECRET` para o webhook |

## 4. Casos de teste

### 4.1 Contas: cadastro (rota 1)

| ID | Prio | Caso | Resultado esperado | Tipo | Status |
|---|---|---|---|---|---|
| CT-CAD-01 | P0 | Cadastro com todos os campos válidos | 201 com `token`, `tipo: Bearer`, `expiraEm` (24 h) e `usuario` com perfil `CLIENTE`; a resposta não traz senha nem hash | Integração | Pendente |
| CT-CAD-02 | P0 | CPF com dígitos verificadores inválidos | 400 com `details.cpf` | Auto | Automatizado |
| CT-CAD-03 | P0 | Senha sem letra ou sem número | 400 com `details.senha` | Auto | Automatizado |
| CT-CAD-04 | P1 | Senha com 7 e com 129 caracteres (limites 8 a 128) | 400 com `details.senha` | Auto | Pendente |
| CT-CAD-05 | P0 | `aceiteTermos` ausente, `false` ou texto `"true"` | 400: precisa ser o booleano `true` | Auto | Pendente |
| CT-CAD-06 | P0 | Corpo que não é um objeto ou JSON quebrado | 400, sem erro 500 | Auto | Automatizado |
| CT-CAD-07 | P1 | Nome, e-mail e CPF com espaços, máscara e maiúsculas | Valores normalizados antes de salvar | Auto | Automatizado |
| CT-CAD-08 | P1 | Nome com menos de 3 ou mais de 120 caracteres | 400 com `details.nome` | Auto | Pendente |
| CT-CAD-09 | P1 | `alturaCm` fora de 100 a 250 ou não inteira | 400 com `details.alturaCm` | Auto | Pendente |
| CT-CAD-10 | P1 | `dataNascimento` fora do formato `AAAA-MM-DD` | 400 com `details.dataNascimento` | Auto | Pendente |
| CT-CAD-11 | P0 | E-mail ou CPF já cadastrado | 409 `CONFLICT` | Integração | Pendente |
| CT-CAD-12 | P1 | E-mails que só diferem em maiúsculas (`Maria@x.com` e `maria@x.com`) | Tratados como o mesmo e-mail: o segundo recebe 409 | Integração | Pendente |
| CT-CAD-13 | P1 | Muitos cadastros do mesmo IP | 429 com `Retry-After` | Integração | Pendente |
| CT-CAD-14 | P1 | Corpo maior que 16 KiB | 413, sem ler o corpo todo | Auto | Automatizado |

### 4.2 Contas: login (rota 2)

| ID | Prio | Caso | Resultado esperado | Tipo | Status |
|---|---|---|---|---|---|
| CT-LOG-01 | P0 | Login com e-mail e senha corretos | 200 no mesmo formato do cadastro | Integração | Pendente |
| CT-LOG-02 | P0 | Senha errada, e-mail inexistente e conta inativa | 401 com a **mesma** mensagem nos três casos | Integração | Pendente |
| CT-LOG-03 | P0 | Tempo de resposta com e-mail inexistente | Parecido com o de senha errada: o login também executa o scrypt completo com um hash falso | Auto | Automatizado (o hash falso tem teste; que a rota o use ainda precisa de conferência) |
| CT-LOG-04 | P0 | Login sem e-mail ou sem senha | 400 | Auto | Automatizado |
| CT-LOG-05 | P0 | Lógica do limite de tentativas (máximo e tentativa seguinte, chaves separadas) | 429 com `Retry-After`; cada chave tem a própria contagem | Auto | Automatizado |
| CT-LOG-06 | P1 | Limites da rota: 10 por e-mail e IP, 30 por IP e 100 por e-mail em 15 minutos | A 11ª tentativa do mesmo e-mail e IP recebe 429 (conferir se o limite conta todas as tentativas ou só as erradas) | Integração | Pendente |
| CT-LOG-07 | P1 | Um estranho erra a senha de outra pessoa várias vezes | O dono ainda consegue entrar (o limite por e-mail sozinho não tranca a conta) | Integração | Pendente |
| CT-LOG-08 | P1 | Corpo maior que 16 KiB | 413 | Auto | Automatizado |

### 4.3 Sessão e perfis

| ID | Prio | Caso | Resultado esperado | Tipo | Status |
|---|---|---|---|---|---|
| CT-SES-01 | P0 | Rota protegida sem o cabeçalho `Authorization` | 401 | Auto | Automatizado |
| CT-SES-02 | P0 | Token adulterado, expirado ou assinado com outro segredo | 401, sem consultar o banco | Auto | Automatizado |
| CT-SES-03 | P0 | Token com algoritmo `none` (com ou sem assinatura) | Recusado | Auto | Automatizado |
| CT-SES-04 | P0 | Conta desativada com token ainda válido | 401 | Auto | Automatizado |
| CT-SES-05 | P0 | Token com `sub` que não é UUID | Recusado antes de chegar ao banco | Auto | Automatizado |
| CT-SES-06 | P0 | Perfil alterado no banco depois de emitir o token | Vale o perfil do banco, não o do token | Auto | Automatizado |
| CT-SES-07 | P0 | Rota restrita chamada por perfil não permitido (`exigirPerfil`), por exemplo um `CLIENTE` em rota de `ADMIN` | 403 | Auto | Em revisão (PR #15) |
| CT-SES-08 | P0 | Rota restrita chamada sem sessão | 401, e o 401 vem antes do 403 | Auto | Em revisão (PR #15) |
| CT-SES-09 | P0 | O banco devolve um perfil fora de `CLIENTE`, `OPERADOR` e `ADMIN` | `exigirSessao` recusa com 401 | Auto | Em revisão (PR #15) |
| CT-SES-10 | P0 | Usar o token de uma conta logo depois de desativá-la | 401 na hora | Integração | Pendente |

### 4.4 Contas: gestão da conta (rotas 3 a 8)

| ID | Prio | Caso | Resultado esperado | Tipo | Status |
|---|---|---|---|---|---|
| CT-CTA-01 | P0 | `GET /api/conta/me` como `CLIENTE` | 200 com dados da conta e `ciclista` (altura, experiência, atividade); campos vazios vêm `null` | Integração | Automatizado (`perfil-ciclista.test.ts`) e conferido de ponta a ponta no Neon `dev` |
| CT-CTA-02 | P1 | `GET /api/conta/me` como `OPERADOR` ou `ADMIN` | 200 sem o campo `ciclista` | Integração | Automatizado (`perfil-ciclista.test.ts`) e conferido de ponta a ponta no Neon `dev` |
| CT-CTA-03 | P0 | `PUT /api/conta/perfil-ciclista` com altura, experiência e atividade válidas | 200 com os três campos gravados | Integração | Automatizado (`perfil-ciclista.test.ts`) e conferido de ponta a ponta no Neon `dev` |
| CT-CTA-04 | P1 | `PUT` com campo `null` ou ausente, e com `id` no corpo | O campo é apagado. O `id` no corpo é chave desconhecida: 400, e nada é gravado (o alvo é sempre a conta do token) | Integração | Automatizado (`perfil-ciclista.test.ts`) e conferido de ponta a ponta no Neon `dev` |
| CT-CTA-05 | P1 | `PUT` com altura fora de 100 a 250 ou valores fora das enumerações | 400 com `details` do campo | Auto | Automatizado (`perfil-ciclista.test.ts`) |
| CT-CTA-06 | P0 | `PUT perfil-ciclista` por `OPERADOR` ou `ADMIN` | 403 | Integração | Automatizado (`perfil-ciclista.test.ts`) e conferido de ponta a ponta no Neon `dev` |
| CT-CTA-07 | P0 | `POST /api/conta/senha` com senha atual correta e nova válida | 204 e a senha é trocada | Auto | Automatizado (`alterar-senha.test.ts`) |
| CT-CTA-08 | P0 | `POST /api/conta/senha` com senha atual incorreta | 401 e nada é trocado | Auto | Automatizado (`alterar-senha.test.ts`) |
| CT-CTA-09 | P1 | Várias tentativas de senha com a senha atual errada | 429 até a janela passar; acertar zera a contagem; o limite é por usuário | Auto | Automatizado (`alterar-senha.test.ts`) |
| CT-CTA-10 | P1 | Nova senha fraca, fora de 8 a 128 ou igual à atual | 400 (a regra "igual à atual" não está no contrato) | Auto | Automatizado (`validacao.test.ts`) |
| CT-CTA-11 | P0 | `POST /api/conta/altura` como `CLIENTE`, com 172 e com 99 | 204 com 172; 400 com `details.alturaCm` com 99 | Integração | Pendente (o validador de altura já tem teste) |
| CT-CTA-12 | P0 | `OPERADOR` ou `ADMIN` em `altura` ou `termos` | 403 e nada gravado (antes respondia 204 sem gravar) | Integração | Em revisão (PR #15) |
| CT-CTA-13 | P0 | `POST /api/conta/termos` com a versão vigente (`2026-11`) e com versão diferente, vazia ou grande demais | 204 com a vigente; 400 nos outros | Integração | Pendente (o validador da versão dos termos já tem teste) |
| CT-CTA-14 | P0 | `POST /api/conta/desativar` | 204; a conta fica inativa (não é apagada) e o login seguinte recebe 401 | Integração | Pendente |
| CT-CTA-15 | P1 | `perfil` e `id` enviados no corpo de altura ou termos | Ignorados | Integração | Em revisão (PR #15) |
| CT-CTA-16 | P1 | `PUT /api/conta/perfil-ciclista` com corpo `{}`, só com campos que não são do perfil (ex.: `"altura"`) ou com um campo certo ao lado de um errado (ex.: `{"alturaCm": 180, "atividde": "TRILHA"}`) | 400 com `details.corpo`, que cita o campo desconhecido; o perfil não é apagado nem alterado. Para apagar de propósito, as três chaves vão como `null` | Auto | Automatizado (`perfil-ciclista.test.ts`) |

### 4.5 Segurança e infraestrutura

| ID | Prio | Caso | Resultado esperado | Tipo | Status |
|---|---|---|---|---|---|
| CT-SEG-01 | P0 | Subir o app sem `SESSION_SECRET` | Erro claro; login e cadastro não funcionam em silêncio | Auto | Automatizado |
| CT-SEG-02 | P0 | `SESSION_SECRET` curto ou igual ao exemplo do `.env.example` | Recusado | Auto | Automatizado |
| CT-SEG-03 | P0 | `/api/health/db` sem segredo configurado, com segredo errado e com o segredo certo | 404 sem segredo configurado; 401 com segredo errado; 200 com o certo | Integração | Pendente (a função `bearerConfere` tem teste, a rota não) |
| CT-SEG-04 | P0 | `/api/health` | Responde 200 sem dados sensíveis | Manual | Pendente |
| CT-SEG-05 | P0 | Procurar segredos no repositório e no que o PR altera (`.env`, senhas, tokens, strings de conexão) | Nenhum encontrado | Manual | Pendente |
| CT-SEG-06 | P1 | Consultas ao banco usam parâmetros (`$1`), sem montar SQL com texto do usuário | Nenhuma consulta concatena entrada do usuário | Manual | Pendente |
| CT-SEG-07 | P1 | Logs de erro e de requisição | Sem senha, token, CPF ou outros dados pessoais | Manual | Aguarda fase 6 |
| CT-SEG-08 | P1 | Erro inesperado em qualquer rota | 500 `INTERNAL_ERROR` com mensagem genérica, sem stack nem SQL | Integração | Pendente |
| CT-SEG-09 | P1 | Formato de erro de todas as rotas | `{ error: { code, message, details } }`, com os `code` da tabela do contrato | Integração | Pendente |
| CT-SEG-10 | P1 | Variáveis usadas pelo código (incluindo `MP_WEBHOOK_SECRET` e `PAGAMENTO_MODO`) | Todas listadas no `.env.example`, sem valor real | Manual | Pendente |
| CT-SEG-11 | P1 | Função `bearerConfere` | Aceita o formato `Bearer` certo; recusa segredo errado, de outro tamanho, sem header ou com outro esquema; sem segredo configurado ou curto demais, nada passa | Auto | Automatizado (`segredo.test.ts`) |

### 4.6 Banco de dados, migrations e RLS

Os casos CT-BD-06 a CT-BD-17, CT-BD-20 e CT-BD-22 a CT-BD-28 correspondem aos testes de `db/tests` (unit, whitebox e
blackbox), que a CI roda com `npm run teste:banco`.

| ID | Prio | Caso | Resultado esperado | Tipo | Status |
|---|---|---|---|---|---|
| CT-BD-01 | P0 | Aplicar e reverter todas as migrations (`migrar:simular` e job da CI) | Sem erro | Integração | Automatizado (CI) |
| CT-BD-02 | P0 | Editar uma migration já aplicada | O runner avisa que o arquivo mudou | Integração | Pendente |
| CT-BD-03 | P0 | Host mostrado pelo runner antes de aplicar | É o branch `dev` do Neon, nunca o `production` sem combinado | Manual | Pendente |
| CT-BD-04 | P1 | App conectado com o papel `app_login` (sem `BYPASSRLS`) | As políticas de RLS valem de verdade | Integração | Bloqueado (o `.env` de desenvolvimento conecta como dono do banco; pendência do tech lead) |
| CT-BD-05 | P0 | `comSessao` com sessão de cliente, de equipe e de visitante | `sessao_perfil()` e `sessao_usuario_id()` leem o que foi declarado; o visitante lê nulos; a sessão não vaza para a próxima consulta na mesma conexão | Integração | Em revisão (PR #15) |
| CT-BD-06 | P0 | Período da reserva vazio, com limite inferior exclusivo ou superior inclusivo | Rejeitado (`reserva_periodo_formato`); o formato `[início, fim)` é aceito | Auto | Automatizado (db/tests) |
| CT-BD-07 | P0 | Valor de aluguel, caução ou pagamento negativo | Rejeitado | Auto | Automatizado (db/tests) |
| CT-BD-08 | P1 | `cancelada_em` incoerente com o status `CANCELADA` | Rejeitado nos dois sentidos | Auto | Automatizado (db/tests) |
| CT-BD-09 | P1 | `pago_em` incoerente com o status `APROVADO` | Rejeitado nos dois sentidos | Auto | Automatizado (db/tests) |
| CT-BD-10 | P0 | Código de reserva repetido e `mp_payment_id` repetido; vários `mp_payment_id` nulos | Os repetidos são rejeitados; os nulos são aceitos | Auto | Automatizado (db/tests) |
| CT-BD-11 | P1 | Reserva com bicicleta inexistente e com status fora do enum | Rejeitada (FK e enum) | Auto | Automatizado (db/tests) |
| CT-BD-12 | P0 | Constraint `reserva_sem_sobreposicao` | É `EXCLUDE USING gist` em `(bicicleta_id, periodo)`, com `WHERE` só nos três status ativos (só a estrutura; o comportamento está em CT-BD-22 a CT-BD-24) | Auto | Automatizado (db/tests) |
| CT-BD-13 | P0 | RLS e políticas de `reserva` e `pagamento` | RLS habilitada; existem as políticas de cliente e de equipe | Auto | Automatizado (db/tests) |
| CT-BD-14 | P1 | Permissões do `app_backend` | `SELECT`, `INSERT` e `UPDATE`, sem `DELETE`, em `reserva` e `pagamento` | Auto | Automatizado (db/tests) |
| CT-BD-15 | P1 | Índices de apoio e tipos de coluna | Existem como na migration | Auto | Automatizado (db/tests) |
| CT-BD-16 | P1 | Enumerações de reserva, método e status de pagamento | Iguais ao modelo de dados | Auto | Automatizado (db/tests) |
| CT-BD-17 | P0 | O cliente A consulta reservas | Vê só a própria; o cliente B também | Auto | Automatizado (db/tests, precisa de `SET ROLE app_backend`) |
| CT-BD-18 | P0 | O cliente A consulta pagamentos do cliente B | Não vê (hoje só há inspeção da política, sem teste de comportamento) | Integração | Pendente |
| CT-BD-19 | P0 | `OPERADOR` e `ADMIN` consultam reservas; visitante consulta | Equipe vê todas; visitante não vê nenhuma | Integração | Pendente |
| CT-BD-20 | P0 | Duas conexões diferentes disputam a mesma bicicleta ao mesmo tempo | Só uma reserva é criada | Integração | Automatizado (`criar_reserva.test.mjs`: `escolher_unidade_para_reserva()` com `SKIP LOCKED` entre 3 conexões; `reservas_api.test.mjs`: corrida pela reserva) |
| CT-BD-21 | P1 | Seed `db/seeds/dev.sql` aplicado no Neon `dev` | Cria empresa, pontos, tipos e bicicletas usados pela demo, e pode ser reaplicado | Manual | Pendente |
| CT-BD-22 | P0 | Reservar uma bicicleta já reservada em horário que se sobrepõe | A segunda reserva é rejeitada | Auto | Automatizado (db/tests, blackbox) |
| CT-BD-23 | P0 | Reservar a bicicleta a partir do minuto em que a reserva anterior termina | Aceita (períodos encostados são permitidos) | Auto | Automatizado (db/tests, blackbox) |
| CT-BD-24 | P0 | Cancelar uma reserva | A bicicleta fica livre no mesmo horário e pode ser reservada de novo | Auto | Automatizado (db/tests, blackbox) |
| CT-BD-25 | P0 | Período da reserva com fim aberto (`[início,)`), `infinity` ou início infinito | Rejeitado (`reserva_periodo_finito`) | Auto | Automatizado (db/tests) |
| CT-BD-26 | P1 | `atualizado_em` de reserva e pagamento a cada UPDATE | O trigger renova o valor, mesmo que o UPDATE informe outro | Auto | Automatizado (db/tests) |
| CT-BD-27 | P0 | `expirar_reservas_vencidas()` | Expira só `PENDENTE_PAGAMENTO` com 15 minutos ou mais e sem pagamento aprovado; libera a bicicleta; expira o pagamento pendente; é idempotente; funciona para um cliente apesar da RLS | Auto | Automatizado (db/tests) |
| CT-BD-28 | P0 | `unidades_livres_por_tipo()` com o papel `app_backend` e perfil `CLIENTE` | Desconta as reservas ativas de outros clientes (a RLS não distorce); ignora reservas encerradas, períodos que só encostam, unidades fora de `DISPONIVEL` e tipos inativos; filtra por ponto; recusa período inválido | Auto | Automatizado (db/tests) |

### 4.7 Empresa, catálogo e painel do administrador (rotas 9, 10 e 19 a 24)

| ID | Prio | Caso | Resultado esperado | Tipo | Status |
|---|---|---|---|---|---|
| CT-CAT-01 | P0 | `GET /api/empresa` sem login | 200 só com pontos ativos; nunca CNPJ, razão social, conta de recebimento nem campos de controle | Integração | Aguarda rota |
| CT-CAT-02 | P0 | `GET /api/catalogo/tipos` sem login | 200 só com tipos ativos, com preços em centavos | Integração | Automatizado (`catalogo.test.ts` e `validacao.test.ts`) e conferido de ponta a ponta no Neon `dev` |
| CT-CAT-03 | P1 | Inativar um tipo | Some do catálogo e das buscas; reservas já feitas continuam visíveis | Integração | Automatizado (`catalogo.test.ts` e `validacao.test.ts`) e conferido de ponta a ponta no Neon `dev` |
| CT-ADM-01 | P0 | Rotas `/api/admin/tipos` e `/api/admin/bicicletas` com `CLIENTE`, `OPERADOR` e sem login | 403 para `CLIENTE` e `OPERADOR`; 401 sem login | Integração | Automatizado (`fabrica-handlers.test.ts`, que prova as 6 rotas do painel com o `exigirPerfil` de verdade) e conferido de ponta a ponta no Neon `dev` |
| CT-ADM-02 | P0 | `POST /api/admin/tipos` com dados válidos | 201 com o tipo criado | Integração | Automatizado (`catalogo.test.ts` e `validacao.test.ts`) e conferido de ponta a ponta no Neon `dev` |
| CT-ADM-03 | P1 | `POST /api/admin/tipos` com nome repetido, sem atividade, altura mínima maior que a máxima, altura fora de 100 a 250, preço negativo ou decimal | 409 para nome repetido; 400 com `details` nos demais | Integração | Automatizado (`catalogo.test.ts` e `validacao.test.ts`) e conferido de ponta a ponta no Neon `dev` |
| CT-ADM-04 | P1 | `PUT /api/admin/tipos/{id}` com `ativo: false`, e só com os campos obrigatórios (sem caução, nível, descrição e `ativo`) | O tipo sai do catálogo; não existe exclusão. Sem os opcionais, o PUT mantém os valores atuais (não zera a caução) | Integração | Automatizado (`catalogo.test.ts` e `validacao.test.ts`) e conferido de ponta a ponta no Neon `dev` |
| CT-ADM-05 | P0 | `POST /api/admin/bicicletas` válida, com código repetido, com tipo ou ponto inexistente e com ponto inativo | 201 com status `DISPONIVEL`; 409 para código repetido; 404 para tipo ou ponto inexistente; 409 para ponto inativo | Integração | Automatizado (`catalogo.test.ts` e `validacao.test.ts`) e conferido de ponta a ponta no Neon `dev` |
| CT-ADM-06 | P1 | `PATCH /api/admin/bicicletas/{id}` com `MANUTENCAO`, e com corpo vazio | A bicicleta deixa de ser reservável; corpo vazio recebe 400 | Integração | Automatizado (`catalogo.test.ts` e `validacao.test.ts`) e conferido de ponta a ponta no Neon `dev` |
| CT-ADM-07 | P1 | `GET /api/admin/bicicletas` com filtros `tipoId` e `status` | Filtra; status inválido recebe 400 | Integração | Automatizado (`catalogo.test.ts` e `validacao.test.ts`) e conferido de ponta a ponta no Neon `dev` |
| CT-ADM-08 | P0 | `GET /api/admin/reservas` por `OPERADOR` e `ADMIN`, com filtros `status` e `data` (fuso de São Luís); por `CLIENTE` | Equipe recebe a lista com cliente e unidade; `CLIENTE` recebe 403 | Integração | Aguarda rota |

### 4.8 Recomendação (rota 11)

As regras e os testes da função vêm do PR #14 (aprovado pelo tech lead; conferir se já foi mesclado antes de atualizar os status): testes em
`recomendacao.test.ts`, `preco.test.ts` e `periodo.test.ts`.

| ID | Prio | Caso | Resultado esperado | Tipo | Status |
|---|---|---|---|---|---|
| CT-REC-01 | P0 | Cliente com altura dentro da faixa de um tipo | O tipo entra na lista | Auto | Em revisão (PR #14) |
| CT-REC-02 | P0 | Cliente com altura fora da faixa de um tipo | O tipo não entra na lista | Auto | Em revisão (PR #14) |
| CT-REC-03 | P0 | Cliente sem altura informada | Nenhum tipo é excluído por altura | Auto | Em revisão (PR #14) |
| CT-REC-04 | P0 | Tipo inativo ou sem unidade livre no período | Não aparece | Auto | Em revisão (PR #14) |
| CT-REC-05 | P0 | Pontuação: altura 50 (máximo no centro da faixa, zero nas pontas), atividade 30 e experiência 20 | Nota de 0 a 100 | Auto | Em revisão (PR #14) |
| CT-REC-06 | P0 | Exemplo do contrato: 172 cm, iniciante, passeio, 4 h, tipo Passeio do seed | 90 pontos e R$ 48,00 | Auto | Em revisão (PR #14) |
| CT-REC-07 | P0 | Dado que falta no perfil (altura, experiência ou atividade) | Não pontua para nenhum tipo; ninguém é favorecido | Auto | Em revisão (PR #14) |
| CT-REC-08 | P1 | Ordem do resultado | Por pontos; empate pelo menor preço por dia; depois pelo nome | Auto | Em revisão (PR #14) |
| CT-REC-09 | P1 | Motivos de cada resultado | Texto com o que favorece e o que pesa contra (por exemplo "Não é a mais indicada para trilha") | Auto | Em revisão (PR #14) |
| CT-REC-10 | P0 | Preço: horas arredondadas para cima; cada 24 h vale o preço do dia; as horas que sobram custam o preço por hora, limitadas a um dia (3 h 10 min = 4 h; 24 h = 1 diária; 25 h = 1 diária + 1 hora) | Valor em centavos inteiros conforme a regra, pela mesma função (`calcularValorAluguel`) na recomendação e na reserva | Auto | Em revisão (este PR; `reservas/domain/preco.test.ts`) |
| CT-REC-11 | P0 | Parâmetros `inicio`, `fim` e `atividade` inválidos ou ausentes | 400 com `details` do campo | Auto | Em revisão (PR #14) |
| CT-REC-12 | P0 | `inicio` ou `fim` sem fuso horário | Recusado (sem fuso, a hora seria lida em UTC na Vercel) | Auto | Em revisão (PR #14) |
| CT-REC-13 | P1 | `inicio` "agora", com até 5 minutos de atraso | Aceito pela folga de 5 minutos; mais que isso no passado é recusado | Auto | Em revisão (PR #14) |
| CT-REC-14 | P1 | Trocar a atividade na busca | Vale a atividade da busca, não a do perfil | Auto | Em revisão (PR #14) |
| CT-REC-15 | P0 | `GET /api/recomendacao` sem login e com `OPERADOR` ou `ADMIN` | 401 sem login; 403 para quem não é cliente | Integração | Automatizado (`buscar-recomendacoes.test.ts`) e conferido de ponta a ponta no Neon `dev` |
| CT-REC-16 | P0 | Período menor que 1 hora ou maior que 7 dias | 400 com `details.fim` | Integração | Automatizado (`buscar-recomendacoes.test.ts`) e conferido de ponta a ponta no Neon `dev` |
| CT-REC-17 | P0 | Nenhuma bicicleta livre no período | 200 com `resultados: []` (não é erro) | Integração | Automatizado (`buscar-recomendacoes.test.ts`) e conferido de ponta a ponta no Neon `dev` |
| CT-REC-18 | P0 | Tipo cuja única unidade tem reserva sobreposta | Não aparece; volta a aparecer depois de cancelar a reserva | Integração | Automatizado (`buscar-recomendacoes.test.ts`) e conferido de ponta a ponta no Neon `dev` |
| CT-REC-19 | P1 | Mais de 60 buscas por minuto do mesmo usuário (e outro cliente no mesmo IP buscando em seguida) | 429 para o usuário que passou do limite; o outro cliente continua recebendo 200. O limite por IP (300 por minuto) é mais folgado | Integração | Automatizado (`buscar-recomendacoes.test.ts`) e conferido de ponta a ponta no Neon `dev` |
| CT-REC-20 | P0 | Tipo cuja única unidade tem reserva `PENDENTE_PAGAMENTO` já vencida, que ninguém listou | O tipo aparece como livre: a rota ignora ou expira as pendentes vencidas, porque a exclusion constraint só as libera quando o status muda | Integração | Automatizado (`buscar-recomendacoes.test.ts`) e conferido de ponta a ponta no Neon `dev` |

### 4.9 Reservas (rotas 12 a 15)

| ID | Prio | Caso | Resultado esperado | Tipo | Status |
|---|---|---|---|---|---|
| CT-RES-01 | P0 | `POST /api/reservas` com tipo livre e período válido | 201, `PENDENTE_PAGAMENTO`, `expiraEm` 15 minutos à frente, código único, valor calculado no servidor (qualquer valor enviado no corpo é ignorado) | Integração | Automatizado (`criar-reserva.test.ts` e `consultar-e-cancelar.test.ts`; contra o banco, `db/tests/blackbox/reservas_api.test.mjs`) |
| CT-RES-02 | P0 | Reserva de um tipo sem nenhuma unidade livre no período | 409 `CONFLICT` | Integração | Automatizado (`criar-reserva.test.ts` e `consultar-e-cancelar.test.ts`; contra o banco, `db/tests/blackbox/reservas_api.test.mjs`) |
| CT-RES-03 | P0 | Dois clientes reservam a última unidade ao mesmo tempo | Um recebe 201 e o outro 409 | Integração | Automatizado com conexões reais (`reservas_api.test.mjs`: 15 rodadas de 2 clientes pela última unidade e 10 de 6 clientes por 3 unidades) |
| CT-RES-04 | P0 | O servidor escolhe a unidade | A mesma bicicleta nunca é entregue a duas reservas ativas que se sobrepõem; o cliente nunca vê o código da unidade | Integração | Automatizado (`criar-reserva.test.ts` e `consultar-e-cancelar.test.ts`; contra o banco, `db/tests/blackbox/reservas_api.test.mjs`) |
| CT-RES-05 | P0 | `tipoId` inexistente ou de tipo inativo | 404 | Integração | Automatizado (`criar-reserva.test.ts` e `consultar-e-cancelar.test.ts`; contra o banco, `db/tests/blackbox/reservas_api.test.mjs`) |
| CT-RES-06 | P0 | Período no passado, fim antes do início, menor que 1 hora ou maior que 7 dias | 400 com `details` | Integração | Automatizado (`criar-reserva.test.ts` e `consultar-e-cancelar.test.ts`; contra o banco, `db/tests/blackbox/reservas_api.test.mjs`) |
| CT-RES-07 | P0 | Bicicleta em `MANUTENCAO`, `BLOQUEADA` ou `BAIXADA` | Não é reservada | Integração | Automatizado (`criar-reserva.test.ts` e `consultar-e-cancelar.test.ts`; contra o banco, `db/tests/blackbox/reservas_api.test.mjs`) |
| CT-RES-08 | P0 | Reserva `PENDENTE_PAGAMENTO` sem pagar por 15 minutos | Vira `EXPIRADA` e libera a bicicleta | Integração | Automatizado (`criar-reserva.test.ts` e `consultar-e-cancelar.test.ts`; contra o banco, `db/tests/blackbox/reservas_api.test.mjs`) |
| CT-RES-09 | P0 | `GET /api/reservas` | Só as reservas do cliente, da mais recente para a mais antiga; marca como `EXPIRADA` as pendentes vencidas antes de listar | Integração | Automatizado (`criar-reserva.test.ts` e `consultar-e-cancelar.test.ts`; contra o banco, `db/tests/blackbox/reservas_api.test.mjs`) |
| CT-RES-10 | P1 | `GET /api/reservas?status=` com valor válido e com valor inválido | Filtra; valor inválido recebe 400 | Integração | Automatizado (`criar-reserva.test.ts` e `consultar-e-cancelar.test.ts`; contra o banco, `db/tests/blackbox/reservas_api.test.mjs`) |
| CT-RES-11 | P0 | `GET /api/reservas/{id}` de outro cliente e de id inexistente | 404 nos dois casos, com a mesma resposta | Integração | Automatizado (`criar-reserva.test.ts` e `consultar-e-cancelar.test.ts`; contra o banco, `db/tests/blackbox/reservas_api.test.mjs`) |
| CT-RES-12 | P1 | `GET /api/reservas/{id}` da própria reserva | Objeto da reserva com `pagamento` (`status` e `metodo`) ou `null` | Integração | Automatizado (`criar-reserva.test.ts` e `consultar-e-cancelar.test.ts`; contra o banco, `db/tests/blackbox/reservas_api.test.mjs`) |
| CT-RES-13 | P0 | `POST /api/reservas/{id}/cancelar` em reserva `PENDENTE_PAGAMENTO` ou `CONFIRMADA` ainda não retirada | 200 `CANCELADA`; a bicicleta volta a ficar livre | Integração | Automatizado (`criar-reserva.test.ts` e `consultar-e-cancelar.test.ts`; contra o banco, `db/tests/blackbox/reservas_api.test.mjs`) |
| CT-RES-14 | P0 | Cancelar reserva já retirada, concluída, cancelada ou expirada | 409 | Integração | Automatizado (`criar-reserva.test.ts` e `consultar-e-cancelar.test.ts`; contra o banco, `db/tests/blackbox/reservas_api.test.mjs`) |
| CT-RES-15 | P1 | Mais de 20 reservas por hora do mesmo usuário | 429 | Integração | Pendente: o limite está implementado e o limite compartilhado é testado em `limite-tentativas.test.ts`, mas a rota ainda não tem teste do 429 |
| CT-RES-16 | P0 | Rotas de reserva sem login e com `OPERADOR` ou `ADMIN` | 401 sem login; 403 para a equipe | Integração | Parcial: o 401 sem login foi conferido à mão nas 4 rotas com o app no ar (`next start`, sem cookie) e `exigirPerfil` é testado em `exigir-sessao.test.ts`. Pendente: teste da rota com 403 para a equipe |
| CT-RES-17 | P0 | Reservar o mesmo período depois que uma reserva pendente venceu e ninguém a listou | 201 para a nova reserva, sem 409 falso; a pendente vencida vira `EXPIRADA` (`POST /api/reservas` expira ou ignora as vencidas antes de reservar) | Integração | Automatizado (`criar-reserva.test.ts` e `consultar-e-cancelar.test.ts`; contra o banco, `db/tests/blackbox/reservas_api.test.mjs`) |

### 4.10 Pagamentos por Pix (rotas 16 a 18)

| ID | Prio | Caso | Resultado esperado | Tipo | Status |
|---|---|---|---|---|---|
| CT-PAG-01 | P0 | `POST /api/pagamentos` com `PIX` em reserva pendente | 201 com `qrCodeBase64`, `copiaECola` e `expiraEm`; cobra só o aluguel (a caução é combinada no balcão) | Integração | Aguarda rota |
| CT-PAG-02 | P0 | Repetir a chamada com um Pix pendente ainda válido | 200 com o mesmo Pix, sem criar outro | Integração | Aguarda rota |
| CT-PAG-03 | P0 | Pagar reserva que não está `PENDENTE_PAGAMENTO` ou que já está paga | 409 | Integração | Aguarda rota |
| CT-PAG-04 | P0 | `metodo` diferente de `PIX` | 400 | Integração | Aguarda rota |
| CT-PAG-05 | P0 | Reserva de outro cliente ou inexistente | 404 | Integração | Aguarda rota |
| CT-PAG-06 | P0 | Mercado Pago fora do ar ou recusando a criação da cobrança | 502 `PAGAMENTO_INDISPONIVEL`; a reserva continua pendente | Integração | Aguarda rota |
| CT-PAG-07 | P1 | Mais de 10 pedidos de pagamento por hora do mesmo usuário | 429 | Integração | Aguarda rota |
| CT-PAG-08 | P0 | `GET /api/pagamentos/{reservaId}/status` | `statusPagamento` e `statusReserva`; `statusPagamento` é `null` sem cobrança; reserva de outro cliente recebe 404 | Integração | Aguarda rota |
| CT-PAG-09 | P0 | Webhook com assinatura válida e pagamento aprovado no Mercado Pago | Pagamento `APROVADO` e reserva `CONFIRMADA` na mesma transação; resposta 200 `{ recebido: true }` | Integração | Aguarda rota |
| CT-PAG-10 | P0 | O mesmo webhook chega duas vezes | Nada é duplicado (`mp_payment_id` único); resposta 200 | Integração | Aguarda rota |
| CT-PAG-11 | P0 | Webhook sem assinatura ou com assinatura inválida (`x-signature`, `x-request-id`) | 401 e nada é alterado | Integração | Aguarda rota |
| CT-PAG-12 | P0 | Webhook cujo corpo diz "aprovado", mas o Mercado Pago não confirma o `data.id` | Nada muda: o servidor não confia no corpo | Integração | Aguarda rota |
| CT-PAG-13 | P1 | Webhook de outro tipo ou de pagamento desconhecido | 200, ignorado | Integração | Aguarda rota |
| CT-PAG-14 | P1 | Pix não pago em 15 minutos | Pagamento `EXPIRADO` e reserva `EXPIRADA` (o contrato só diz que a reserva expira; confirmar se o pagamento também muda) | Integração | Aguarda rota |
| CT-PAG-15 | P1 | `PAGAMENTO_MODO=simulado` | Aprova sem o Mercado Pago só em desenvolvimento e na demo; desligado em produção | Manual | Aguarda rota |
| CT-PAG-16 | P1 | Valores monetários | Sempre inteiros em centavos, sem arredondamento errado | Auto | Aguarda rota |
| CT-PAG-17 | P0 | Pix aprovado depois que a reserva expirou (e a bicicleta já foi reservada por outra pessoa) | O webhook não confirma a reserva expirada: ela continua `EXPIRADA`, não há duas reservas ativas na mesma bicicleta e o pagamento fica registrado para tratamento manual | Integração | Aguarda rota |
| CT-PAG-18 | P0 | Webhook com valor pago diferente do cobrado | O servidor compara com `valor_aluguel_centavos`; se for diferente, não confirma a reserva e registra a divergência | Integração | Aguarda rota |
| CT-PAG-19 | P0 | Dois pagamentos `APROVADO` na mesma reserva | O segundo é recusado ou ignorado; hoje nada no banco impede isso (sugestão: índice único parcial em `pagamento(reserva_id)` para `APROVADO`) | Integração | Pendente (o banco ainda não impede) |
| CT-PAG-20 | P0 | Webhook sem sessão de usuário atualizando `pagamento` e `reserva` com a RLS ligada | A atualização funciona pelo papel ou perfil de serviço do webhook; um visitante ou cliente não consegue fazer o mesmo | Integração | Aguarda rota (hoje não existe perfil para isso) |

### 4.11 Operação: retirada e devolução (rotas 25 a 27)

| ID | Prio | Caso | Resultado esperado | Tipo | Status |
|---|---|---|---|---|---|
| CT-OPE-01 | P0 | Retirada de reserva `CONFIRMADA` por `OPERADOR` ou `ADMIN`, a partir de 30 minutos antes do início | 200, `EM_ANDAMENTO`, com a bicicleta (`id` e `codigo`) | Integração | Aguarda rota |
| CT-OPE-02 | P0 | Retirada antes da janela de 30 minutos ou com checklist inválido | 400 | Integração | Aguarda rota |
| CT-OPE-03 | P0 | Retirada de reserva que não está `CONFIRMADA`, ou retirada repetida | 409 | Integração | Aguarda rota |
| CT-OPE-04 | P0 | Devolução de reserva `EM_ANDAMENTO` | 200, `CONCLUIDA`; a bicicleta volta a ficar livre | Integração | Aguarda rota |
| CT-OPE-05 | P0 | Devolução de reserva que não está `EM_ANDAMENTO`, ou devolução repetida | 409 | Integração | Aguarda rota |
| CT-OPE-06 | P0 | Retirada ou devolução por `CLIENTE` ou sem login | 403 para `CLIENTE`; 401 sem login | Integração | Aguarda rota |
| CT-OPE-07 | P1 | Checklist com itens (`nome` e `ok`) e observações | É guardado e fica consultável | Integração | Aguarda rota |
| CT-OPE-08 | P1 | Retirada ou devolução de reserva inexistente | 404 | Integração | Aguarda rota |

### 4.12 Interface e navegação (`/app`)

Casos do PR #19 (base visual e navegação por perfil). O PR teve pedido de mudanças do tech lead (menu com os
perfis do modelo antigo e `/app` quebrando com `ADMIN`). O Renan corrigiu, o Luis aprovou e falta o merge.
Os casos CT-UI-04 e CT-UI-05 falharam na primeira revisão e foram corrigidos; reexecutar depois do merge.

| ID | Prio | Caso | Resultado esperado | Tipo | Status |
|---|---|---|---|---|---|
| CT-UI-01 | P0 | Abrir `/app` sem token de sessão | Redireciona para `/login` | Manual | Em revisão (PR #19) |
| CT-UI-02 | P0 | Abrir `/app` com token expirado | Redireciona para `/login` | Manual | Em revisão (PR #19) |
| CT-UI-03 | P0 | Entrar como `CLIENTE` | Menu inferior com Início, Reservas e Perfil | Manual | Em revisão (PR #19) |
| CT-UI-04 | P0 | Entrar como `ADMIN` e como `OPERADOR` (perfis do modelo novo) | A tela carrega, sem "This page couldn't load" | Manual | Em revisão (PR #19, corrigido e aprovado; reexecutar após o merge) |
| CT-UI-05 | P0 | Token com perfil desconhecido ou ausente | A tela nunca quebra: volta ao `/login` | Manual | Em revisão (PR #19, corrigido e aprovado; reexecutar após o merge) |
| CT-UI-06 | P0 | `lerSessao` com token válido, expirado, malformado e sem `perfil` | Devolve a sessão ou nada, sem lançar erro | Auto | Em revisão (PR #19, testes novos de `lerSessao`) |
| CT-UI-07 | P1 | Cadastro e login concluídos | Levam a `/app` em vez de `/` | Manual | Em revisão (PR #19) |
| CT-UI-08 | P1 | Cabeçalho do app | Logo e botão de sair; sair encerra a sessão; item ativo do menu destacado | Manual | Em revisão (PR #19) |
| CT-UI-09 | P2 | Telas de destino ainda "em construção" | Mostram o aviso, sem erro | Manual | Em revisão (PR #19) |
| CT-UI-10 | P1 | Token sem `exp` lido pela tela | A tela não o trata como sessão válida (hoje `lerSessao` aceita, porque `undefined <= agora` dá falso); a API continua recusando com 401 | Auto | Pendente (sugestão do tech lead no PR #19) |

### 4.13 Avisos e auditoria (fora do contrato do MVP)

Só como lembrete: não há rota no contrato, então não bloqueiam o MVP.

| ID | Prio | Caso | Resultado esperado | Tipo | Status |
|---|---|---|---|---|---|
| CT-NOT-01 | P2 | Reserva confirmada | Cliente recebe o aviso no canal configurado | Integração | Aguarda fase 6 |
| CT-AUD-01 | P2 | Alteração de reserva, estoque ou valores | Registro em `auditoria_log` com dados antes e depois | Integração | Aguarda fase 6 |

**Total:** 174 casos (P0: 116, P1: 55, P2: 3). 42 já têm teste automatizado ou rodam na CI, 29 estão em PRs abertos (#14, #15, #19 e #30), 1 está bloqueado, 70 aguardam rotas que ainda não existem e 32 estão pendentes de execução. Nenhum caso falhou até agora.

## 5. Checklist de aceite por tela

Cada tela só é considerada aceita quando todos os itens estiverem marcados no navegador do computador e
no do celular, com a conta e os dados de teste.

### Cadastro (`/cadastro`)
- [ ] Todos os campos têm rótulo e mensagem de erro clara, em português.
- [ ] CPF inválido, senha fraca e termos não aceitos impedem o envio.
- [ ] E-mail ou CPF já cadastrado mostra uma mensagem clara (a tela trata o 409).
- [ ] Depois de cadastrar, o cliente é levado ao app (`/app`) e entende o que fazer.
- [ ] Altura, experiência e atividade são opcionais e explicam para que servem.
- [ ] O botão não permite enviar duas vezes seguidas.

### Login (`/login`)
- [ ] Erro de e-mail ou senha mostra mensagem genérica.
- [ ] Depois de muitas tentativas, mostra aviso de espera (429).
- [ ] Sessão expirada leva de volta ao login.
- [ ] Sair da conta encerra a sessão.

### Início (`/`)
- [ ] Mostra o que é o serviço e leva ao cadastro e ao login.
- [ ] Mostra os dados públicos da locadora (nome, telefone e ponto de retirada).
- [ ] Carrega bem no celular, sem rolagem horizontal.

### Navegação do app (`/app`)
- [ ] Sem sessão ou com sessão expirada, leva ao `/login`.
- [ ] `CLIENTE` e `OPERADOR` veem Início, Reservas e Perfil. O menu do `ADMIN` ainda será definido pelo time.
- [ ] Um perfil inesperado no token nunca derruba a tela.
- [ ] Cabeçalho com logo e botão de sair; item ativo destacado.
- [ ] Telas "em construção" avisam isso com clareza.

### Perfil e conta
- [ ] Mostra os dados da conta e do ciclista (altura, experiência, atividade) e permite alterá-los.
- [ ] Trocar a senha pede a senha atual e mostra erro claro quando ela está errada.
- [ ] Desativar a conta pede confirmação e encerra a sessão.

### Catálogo e recomendação
- [ ] Mostra só tipos ativos, com preço por hora e por dia e caução.
- [ ] A busca por período mostra só o que tem unidade livre e avisa quando não há nenhuma (lista vazia).
- [ ] A lista recomendada vem na ordem certa e mostra os motivos.
- [ ] Sem altura informada, a tela ainda permite buscar e avisa que a recomendação fica menos precisa.

### Reserva
- [ ] Mostra período, ponto, valor do aluguel e caução antes de confirmar.
- [ ] Impede período inválido (passado, menos de 1 hora, mais de 7 dias).
- [ ] Quando não há unidade livre (409), oferece outro horário.
- [ ] Mostra o tempo restante de 15 minutos para pagar.

### Pagamento por Pix
- [ ] Mostra QR code, código copia e cola e o prazo de expiração.
- [ ] A tela consulta o status a cada 3 segundos e passa para "confirmada" sem recarregar a página.
- [ ] Se o Pix expirar, a tela avisa que a reserva expirou e leva a uma nova busca.
- [ ] Se o Mercado Pago estiver indisponível (502), mostra mensagem clara e permite tentar de novo.

### Minhas reservas
- [ ] Lista só as reservas do cliente logado, com status e código.
- [ ] Permite cancelar antes da retirada e explica que reserva paga é tratada no balcão.

### Painel do operador
- [ ] Lista as reservas do dia, com filtro por status e data.
- [ ] Retirada e devolução usam o checklist (freios, pneus, corrente, capacete, luzes) e observações.
- [ ] Retirada fora da janela (mais de 30 minutos antes) mostra o erro de forma compreensível.

### Painel do administrador
- [ ] Cadastro e edição de tipos e bicicletas, com mensagens de erro por campo.
- [ ] Inativar tipo e colocar bicicleta em manutenção, sem apagar histórico.
- [ ] Cliente comum e operador não acessam as telas de administração.

### Páginas de erro e de carregamento
- [ ] Página 404 e página de erro geral em português, com volta para o início.
- [ ] Estados de carregamento visíveis nas telas que consultam o banco.

## 6. Critérios de saída para o MVP

O MVP só é considerado pronto quando:

1. Todos os casos P0 estão em `Passou` ou `Automatizado`, e nenhum está `Falhou`.
2. Os casos P1 que falharem têm defeito registrado e acordo da equipe sobre ficar para depois.
3. A CI da `dev` está verde (`lint`, `typecheck`, testes, migrations, testes de banco e `build`).
4. As variáveis `SESSION_SECRET`, `MP_WEBHOOK_SECRET` (e `HEALTH_DB_SECRET`, se usada) estão cadastradas na
   Vercel, com valores diferentes em Preview e Production.
5. O fluxo completo (cadastro, login, busca com recomendação, reserva, Pix no sandbox ou simulado,
   retirada e devolução) foi percorrido do início ao fim, no celular e no computador.
6. Nenhum segredo, dado pessoal real ou pagamento real foi usado nos testes.

## 7. Achados de QA e decisões em aberto

### Pontos para alinhar com o tech lead

Encontrados ao comparar o contrato com o código e os testes.

| # | Achado | Impacto |
|---|---|---|
| 1 | O contrato lista 6 status de reserva e 4 de pagamento, mas o banco tem 7 de reserva (inclui `NAO_RETIRADA`) e 5 de pagamento (inclui `ESTORNADO`); o teste de banco exige exatamente esses valores | A API ou a tela podem receber um status que o contrato não prevê. Atualizar o contrato ou declarar que não serão usados |
| 2 | As rotas 6 (altura) e 7 (termos) listam só `CLIENTE` e os erros 400, 401 e 413. O PR #15 faz a equipe receber 403 | Acrescentar o 403 ao contrato |
| 3 | O contrato diz que `inicio` "não pode estar no passado"; o PR #14 aceita 5 minutos de folga | Alinhar o texto do contrato com o código |
| 4 | O cadastro responde 409 para e-mail ou CPF já cadastrado, enquanto o login é cuidadoso para não revelar se a conta existe | Risco de descobrir quem tem conta. Decidir se é aceito no MVP |
| 5 | Os testes de banco usam uma conexão com savepoint, então não provam concorrência (a disputa pela mesma bicicleta já é coberta com conexões reais, CT-BD-20); RLS de `pagamento` e acesso da equipe só são conferidos pela inspeção das políticas | Casos CT-BD-18 e CT-BD-19 |
| 6 | O `npm test` da raiz agora roda só `src/**/*.test.ts`; os testes de banco rodam apenas no job de banco da CI | Quem mexer em migration precisa rodar os testes de `db` ou esperar a CI |
| 7 | A RLS só vale com o papel `app_login`, e o `.env` de desenvolvimento conecta como dono do banco | CT-BD-04 fica `Bloqueado` até o tech lead fechar a pendência |
| 8 | `src/shared/http/api-cliente.ts` ainda declara `GERENTE_LOCADORA` e `ADMIN_PLATAFORMA` no tipo do perfil, e `lerSessao` aceita token sem `exp` (sugestões do tech lead no PR #19, para outro PR) | Alinhar os tipos com o modelo novo; caso CT-UI-10 |
| 9 | O PR #15 está com base em `feat/contas-gestao-conta-cliente`, que já foi mesclada pelo #9, e não em `dev` | Trocar a base para `dev` antes do merge. Dependem dele CT-SES-07 a CT-SES-09, CT-CTA-12 e CT-BD-05 |
| 10 | Riscos de reserva e pagamento apontados na revisão do tech lead: pendente vencida que ninguém listou, Pix aprovado depois da expiração, valor pago diferente do cobrado, dois pagamentos aprovados na mesma reserva e webhook sem perfil sob RLS | CT-RES-17, CT-REC-20 e CT-PAG-17 a CT-PAG-20 |
| 11 | Na revisão do PR #19, o `/app` do `ADMIN` aparece como "Painel da plataforma", nome do modelo antigo; com uma só locadora o nome esperado é o da locadora | Confirmar o texto com o Renan e o Luis; conferir em CT-UI-04 |

### Decisões ainda em aberto

| Decisão | Efeito no plano |
|---|---|
| Idade mínima para alugar e confirmação de e-mail (não estão no contrato) | Podem virar casos de cadastro |
| Formato final de `horarios` do ponto (`diaSemana` de 0 a 6?) | Resultado esperado do CT-CAT-01 |
| Texto exato das mensagens de erro 409 mostradas ao cliente | Checklist das telas de reserva e cadastro |
| Menu do perfil `ADMIN` (por enquanto pode ser igual ao do `OPERADOR`) | CT-UI-03, CT-UI-04 e o checklist de navegação |
| O que fazer com um pagamento aprovado de uma reserva já expirada (devolver no balcão?) | Resultado esperado do CT-PAG-17 |
| Perfil ou papel de serviço para o webhook atualizar `pagamento` e `reserva` sob a RLS | CT-PAG-20 |
| Regras de preço (horas arredondadas para cima, 24 h = uma diária, horas que sobram limitadas a uma diária) e a folga de 5 minutos no início são regras assumidas (dados fictícios); reavaliar quando houver locadora real | CT-REC-10 e CT-REC-13 |

### Já decidido pelo contrato

Faixa de altura de 100 a 250 cm; prazo de 15 minutos para pagar; só Pix no MVP; cancelamento só antes da
retirada, sem estorno automático (reserva paga é tratada no balcão); recomendação e reserva só para `CLIENTE`.

## 8. Registro de execução

Preencher a cada rodada de testes.

| Data | Versão (commit na `dev`) | Quem testou | Casos executados | Passou | Falhou | Defeitos abertos |
|---|---|---|---|---|---|---|
| 10/11/2026 | `7c70046` | William | `npm ci`, `lint`, `typecheck`, `npm test` (70 testes) e `build` | 5 de 5 comandos (70 de 70 testes) | 0 | Nenhum |

Observações da rodada de 10/11/2026:

- O `npm audit` aponta 7 vulnerabilidades moderadas e o `eslint@9.39.5` aparece como descontinuado. Não são da T06; sugerir uma tarefa de dependências ao tech lead.
- O `npm ci` avisa que `unrs-resolver@1.12.2` tem script de instalação ainda não coberto por `allowScripts`. É só um aviso do npm.
- Os testes avisam `MODULE_TYPELESS_PACKAGE_JSON` (falta `"type": "module"` no `package.json`). Só afeta desempenho, não é falha.
- O teste de `sessao.test.ts` ainda descreve `locadora` e `gerente` (modelo antigo); o PR #15 deve atualizar.
- Segundo a revisão do PR #19, a união da branch do Renan com a `dev` e com os PRs #14 e #15 roda 109 testes, todos passando.
- Os testes de banco (`db/tests`) não foram rodados localmente: rodam no job de banco da CI.
