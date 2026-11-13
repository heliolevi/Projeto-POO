# Mudança de escopo: de várias locadoras para uma só

Data da decisão: novembro de 2026.

## Resumo

Seguindo a sugestão do professor, o projeto foi reduzido em tamanho e complexidade. Antes, o Bike Ilha
Club seria uma **plataforma que reúne várias locadoras** de São Luís, com busca da locadora mais
próxima, comissão e repasse. Agora ele é o **sistema de aluguel de uma única locadora**.

O que continua igual é o núcleo do produto: o **sistema de recomendação de bicicletas baseado nos
dados do cliente**. O cliente informa altura, experiência e atividade, e o sistema mostra as
bicicletas disponíveis na data escolhida, ordenadas pela adequação ao seu perfil.

Como o projeto ainda está no começo, mudar agora é barato: só o cadastro e o login de clientes têm
código, e o banco tem poucas tabelas e nenhum dado real.

## Antes e depois

| Tema | Antes (plataforma) | Agora (locadora única) |
|---|---|---|
| Objetivo | Reunir várias locadoras e achar a mais próxima | Alugar bicicletas de uma locadora e recomendar a certa para cada cliente |
| Quem usa | Clientes, equipes de várias locadoras e administradores da plataforma | Clientes e a equipe da locadora (administrador e operador) |
| Perfis de usuário | `CLIENTE`, `OPERADOR`, `GERENTE_LOCADORA`, `ADMIN_PLATAFORMA` | `CLIENTE`, `OPERADOR`, `ADMIN` |
| Dados da empresa | Tabela `locadora` com várias linhas | Tabela `empresa` com uma linha só |
| Isolamento de dados | Entre locadoras, por `locadora_id` e RLS | Entre clientes: cada um vê só os próprios dados |
| Busca | Locadora mais próxima (PostGIS) e galeria | Disponibilidade por período e recomendação |
| Pagamentos | Pix, cartão, assinatura recorrente e repasse às locadoras | Pix e cartão, direto para a locadora |
| Painéis | Um por locadora e um da plataforma | Um só, da locadora |
| Módulos | 9, incluindo `locadoras` | 8: `locadoras` sai e `busca` vira `recomendacao` |

## O que sai do escopo

- Cadastro de locadoras e adesão de novas locadoras.
- Busca da locadora mais próxima (o PostGIS passa a ser opcional).
- Comissão da plataforma, conta de recebimento por locadora e repasse.
- Perfis `GERENTE_LOCADORA` e `ADMIN_PLATAFORMA`, e a tabela de planos e assinaturas
  (assinatura recorrente pode voltar numa fase posterior).
- Isolamento entre locadoras: colunas `locadora_id`, views `locadora_catalogo` e `locadora_equipe`,
  políticas de RLS por locadora e as funções que as sustentam.
- Riscos do modelo de plataforma: adesão das locadoras, regras de repasse e inadimplência de assinaturas.

## O que fica e é reaproveitado

- **Aplicação:** Next.js, módulos, camada compartilhada, ESLint com fronteiras entre módulos e a CI.
- **Contas:** cadastro e login de cliente, senhas com scrypt, token de sessão, `exigirSessao`, limite de
  tentativas e validações (CPF, data, altura, aceite dos termos).
- **Banco:** tabelas `usuario`, `ponto` e `limite_tentativas`, o runner de migrations, o papel
  `app_backend` e a segurança por linha como técnica (só muda o critério: de locadora para cliente).
- **Regras previstas desde o início:** reservas sem sobreposição por *exclusion constraint*, retirada e
  devolução com checklist e fotos, ocorrências, notificações e auditoria.
- **Testes:** os testes de validação, senha, token, sessão e limite continuam valendo.

## O que será feito

| Fase | O que entrega | Principais mudanças |
|---|---|---|
| **0. Documentação e modelagem** (este commit) | Novo escopo e novo modelo de dados documentados | `README.md`, `docs/modelo-de-dados.md`, este documento e `docs/andamento-do-projeto.md` |
| **1. Simplificar o que já existe** | Banco e código no novo modelo | Migration `0004`: cria `empresa`; tira `locadora_id` e `nivel_acesso` de `usuario`; troca os perfis por `CLIENTE`, `OPERADOR` e `ADMIN`; tira `locadora_id` de `ponto`; remove views, políticas e funções por locadora; ajusta as permissões do `app_backend`. No código: perfis no módulo `contas`, `comSessao` passa a declarar o usuário, remover o módulo `locadoras` e renomear `busca` para `recomendacao`. Atualizar testes e a CI. Aplicar no Neon `dev` e depois no `production` |
| **2. Catálogo e estoque** | A locadora cadastra o que aluga | Migration com `tipo_bicicleta`, `bicicleta` e `arquivo` (fotos); telas e rotas do administrador; dados da empresa e pontos |
| **3. Disponibilidade, reservas e recomendação** | O cliente vê as bicicletas recomendadas e reserva | Migration com `reserva` e a *exclusion constraint*; consulta de disponibilidade; recomendação por regras; campos `experiencia` e `atividade_preferida` no cadastro e na gestão da conta |
| **4. Pagamentos** | Pix simulado no MVP; Mercado Pago em stand by | Migration com `pagamento`; **no MVP não há integração com o Mercado Pago**: o Pix é simulado (`PAGAMENTO_MODO=simulado`) e a reserva é confirmada sem cobrança real. Integração com o Mercado Pago e confirmação por webhook ficam para depois do MVP; expiração da reserva não paga continua |
| **5. Operação** | Retirada, devolução e ocorrências | Migration com `movimentacao` e `ocorrencia`; checklist e fotos; painel do operador |
| **6. Avisos e fechamento** | Notificações e auditoria | Migration com `notificacao` e `auditoria_log`; WhatsApp, e-mail e web push; nova rodada de validação de segurança |
| **Depois** | Se houver tempo | Assinaturas e créditos; retorno do cliente após o aluguel para melhorar a recomendação; mais de um ponto de retirada |

### Estratégia do banco na fase 1

As migrations `0001` a `0003` já foram aplicadas no Neon (`dev` e `production`). Há duas formas de chegar
ao modelo novo:

- **A. Migration incremental `0004` (recomendada).** Preserva o histórico e o runner confere os
  checksums. Como não há dados reais, a migration pode simplesmente remover o que sai.
- **B. Recriar o banco** e reescrever a `0001` já no modelo novo. Deixa o histórico mais limpo, mas
  obriga a refazer os branches do Neon e apaga a rastreabilidade do que foi aplicado.

## Impacto no trabalho em andamento

- **Cadastro e gestão da conta do cliente** (branch `feat/contas-gestao-conta-cliente`): continuam
  valendo. CPF e altura são mantidos; só faltará acrescentar experiência e atividade preferida na fase 3.
- **Tela de cadastro:** já tem a pendência do CPF e ganhará os campos da recomendação.
- **Módulo `locadoras`:** só tem a pasta vazia; sai sem perda.
- **Pendências de infraestrutura** (`SESSION_SECRET` e `app_login` no `production`): não mudam.
- **Relatório de validação do backend:** os achados sobre RLS e a visão da equipe sobre a locadora
  deixam de se aplicar ao modelo novo; os demais continuam valendo.

## Decisões em aberto

| Decisão | O que foi assumido |
|---|---|
| Quantos pontos de retirada a locadora tem | Um ou mais; a tabela `ponto` fica |
| Mercado Pago | **Em stand by (novembro de 2026).** O MVP não usa o Mercado Pago: o pagamento é simulado. A integração entra numa fase posterior |
| Dados da locadora (razão social, CNPJ, contato, conta no Mercado Pago, quando a integração entrar) | Entram na tabela `empresa` quando a locadora for definida |
| Valor da recomendação | Regras simples e explicáveis; pesos de altura 50, atividade 30 e experiência 20 como ponto de partida, a calibrar com a locadora |
| Dados do cliente usados na recomendação | Altura, experiência e atividade preferida; peso e outros dados ficam de fora por minimização (LGPD) |
| Perfis da equipe | `ADMIN` (gestão) e `OPERADOR` (atendimento); sem perfil de gerente separado |
| Estratégia do banco (A ou B acima) | A, migration incremental |
| PostGIS | Opcional; fica habilitado por enquanto |
| Assinaturas e créditos | Fora do escopo inicial |
