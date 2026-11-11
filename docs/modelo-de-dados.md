# Modelo de dados

Modelo para **uma única locadora**, com os dados que alimentam a recomendação de bicicletas.

> **Atenção: este é o modelo-alvo.** O banco hoje ainda está nas migrations `0001` a `0003`, que
> seguem o modelo anterior (várias locadoras). A seção
> [Do modelo anterior para este](#do-modelo-anterior-para-este) lista o que muda, e o plano de
> migração está em [mudanca-de-escopo.md](mudanca-de-escopo.md). Até a migration `0004` ser
> aplicada, o banco continua com a tabela `locadora`, as views e as políticas descritas no
> histórico do Git.

## Diagrama

```mermaid
erDiagram
    EMPRESA {
        boolean id PK "sempre true: uma linha só"
        text razao_social
        text nome_fantasia
        text cnpj UK
        citext email
        text telefone
        text_array documentos_exigidos
        text conta_recebimento_id
        timestamptz atualizado_em
    }

    PONTO {
        uuid id PK
        text nome UK
        text logradouro
        text numero
        text complemento
        text bairro
        text cep
        text cidade
        char uf
        geography localizacao "opcional"
        text telefone
        jsonb horarios
        boolean ativo
        timestamptz criado_em
        timestamptz atualizado_em
    }

    USUARIO {
        uuid id PK
        perfil_usuario perfil
        text nome
        citext email UK
        text senha_hash
        text telefone
        boolean ativo
        uuid ponto_id FK "operador"
        text cpf UK "cliente"
        date data_nascimento "cliente"
        smallint altura_cm "cliente, recomendacao"
        experiencia experiencia "cliente, recomendacao"
        atividade atividade_preferida "cliente, recomendacao"
        timestamptz aceite_termos_em "cliente"
        text versao_termos "cliente"
        timestamptz criado_em
        timestamptz atualizado_em
    }

    TIPO_BICICLETA {
        uuid id PK
        text nome
        text descricao
        atividade_array atividades
        smallint altura_min_cm
        smallint altura_max_cm
        experiencia nivel_recomendado
        integer preco_hora_centavos
        integer preco_dia_centavos
        integer valor_caucao_centavos
        boolean ativo
        timestamptz criado_em
        timestamptz atualizado_em
    }

    BICICLETA {
        uuid id PK
        uuid tipo_id FK
        uuid ponto_id FK
        text codigo UK
        text numero_serie
        text tamanho_quadro
        status_bicicleta status
        text observacoes
        timestamptz criado_em
        timestamptz atualizado_em
    }

    RESERVA {
        uuid id PK
        text codigo UK
        uuid cliente_id FK
        uuid bicicleta_id FK
        uuid ponto_id FK
        tstzrange periodo "exclusion constraint"
        status_reserva status
        integer valor_aluguel_centavos
        integer valor_caucao_centavos
        timestamptz criado_em
        timestamptz atualizado_em
        timestamptz cancelada_em
    }

    PAGAMENTO {
        uuid id PK
        uuid reserva_id FK
        metodo_pagamento metodo
        integer valor_centavos
        status_pagamento status
        text mp_payment_id UK
        text qr_code_pix
        timestamptz pix_expira_em
        timestamptz pago_em
        timestamptz criado_em
        timestamptz atualizado_em
    }

    MOVIMENTACAO {
        uuid id PK
        uuid reserva_id FK
        uuid operador_id FK
        tipo_movimentacao tipo
        timestamptz data_hora
        jsonb checklist
        text observacoes
    }

    OCORRENCIA {
        uuid id PK
        uuid reserva_id FK
        uuid bicicleta_id FK
        uuid aberta_por FK
        tipo_ocorrencia tipo
        text descricao
        status_ocorrencia status
        integer valor_cobrado_centavos
        timestamptz criada_em
        timestamptz resolvida_em
    }

    ARQUIVO {
        uuid id PK
        finalidade_arquivo finalidade
        text chave_storage
        text tipo_mime
        integer tamanho_bytes
        uuid usuario_id FK "documento do cliente"
        uuid tipo_bicicleta_id FK "foto do tipo"
        uuid movimentacao_id FK "foto da retirada ou devolucao"
        uuid ocorrencia_id FK "evidencia"
        uuid enviado_por FK
        timestamptz enviado_em
    }

    NOTIFICACAO {
        uuid id PK
        uuid usuario_id FK
        canal_notificacao canal
        tipo_notificacao tipo
        text titulo
        text mensagem
        status_notificacao status
        timestamptz agendada_para
        timestamptz enviada_em
        timestamptz lida_em
    }

    AUDITORIA_LOG {
        uuid id PK
        text entidade
        uuid entidade_id
        acao_auditoria acao
        uuid usuario_id
        jsonb dados_antes
        jsonb dados_depois
        text ip
        timestamptz criado_em
    }

    PONTO |o--o{ USUARIO : "operador atua em"
    PONTO ||--o{ BICICLETA : abriga
    TIPO_BICICLETA ||--o{ BICICLETA : unidades
    USUARIO ||--o{ RESERVA : "cliente faz"
    BICICLETA ||--o{ RESERVA : "é reservada em"
    PONTO ||--o{ RESERVA : "retirada e devolução"
    RESERVA ||--o{ PAGAMENTO : "é paga por"
    RESERVA ||--o{ MOVIMENTACAO : registra
    USUARIO |o--o{ MOVIMENTACAO : "operador executa"
    RESERVA ||--o{ OCORRENCIA : gera
    BICICLETA ||--o{ OCORRENCIA : envolve
    USUARIO ||--o{ NOTIFICACAO : recebe
    USUARIO |o--o{ ARQUIVO : "documento"
    TIPO_BICICLETA |o--o{ ARQUIVO : "fotos"
    MOVIMENTACAO |o--o{ ARQUIVO : "fotos"
    OCORRENCIA |o--o{ ARQUIVO : "evidências"
```

`AUDITORIA_LOG` não tem ligação desenhada porque aponta para qualquer entidade por nome e id
(`entidade` e `entidade_id`).

## Enumerações

| Tipo | Valores |
|---|---|
| `perfil_usuario` | `CLIENTE`, `OPERADOR`, `ADMIN` |
| `experiencia` | `INICIANTE`, `INTERMEDIARIO`, `AVANCADO` |
| `atividade` | `PASSEIO`, `URBANO`, `TRILHA`, `ESPORTE`, `TURISMO` |
| `status_bicicleta` | `DISPONIVEL`, `ALUGADA`, `MANUTENCAO`, `BLOQUEADA`, `BAIXADA` |
| `status_reserva` | `PENDENTE_PAGAMENTO`, `CONFIRMADA`, `EM_ANDAMENTO`, `CONCLUIDA`, `CANCELADA`, `EXPIRADA`, `NAO_RETIRADA` |
| `metodo_pagamento` | `PIX`, `CARTAO_CREDITO`, `CARTAO_DEBITO` |
| `status_pagamento` | `PENDENTE`, `APROVADO`, `RECUSADO`, `ESTORNADO`, `EXPIRADO` |
| `tipo_movimentacao` | `RETIRADA`, `DEVOLUCAO` |
| `tipo_ocorrencia` | `DANO`, `FURTO`, `ATRASO`, `ACIDENTE`, `OUTRO` |
| `status_ocorrencia` | `ABERTA`, `EM_ANALISE`, `RESOLVIDA`, `CANCELADA` |
| `finalidade_arquivo` | `DOCUMENTO_CLIENTE`, `FOTO_TIPO_BICICLETA`, `FOTO_MOVIMENTACAO`, `EVIDENCIA_OCORRENCIA` |
| `canal_notificacao` | `WEB_PUSH`, `WHATSAPP`, `EMAIL` |
| `tipo_notificacao` | `RESERVA_CONFIRMADA`, `LEMBRETE_RETIRADA`, `LEMBRETE_DEVOLUCAO`, `PAGAMENTO_APROVADO`, `OCORRENCIA_ABERTA` |
| `status_notificacao` | `AGENDADA`, `ENVIADA`, `FALHA`, `LIDA` |
| `acao_auditoria` | `CRIACAO`, `ATUALIZACAO`, `EXCLUSAO` |

## Regras de cada tabela

### `empresa` (um único registro)

Os dados da locadora e as regras gerais. A tabela tem uma coluna `id boolean` fixa em `true`, com
`CHECK (id)` e chave primária, então o banco impede uma segunda linha. Substitui a antiga tabela
`locadora`. Não há comissão nem repasse.

### `usuario`

Clientes, operadores e administradores ficam na mesma tabela, diferenciados por `perfil`. As
constraints garantem os campos de cada perfil:

| Perfil | `ponto_id` | CPF, aceite dos termos | Dados de recomendação |
|---|---|---|---|
| `CLIENTE` | proibido | obrigatórios | altura, experiência e atividade preferida (opcionais) |
| `OPERADOR` | opcional (ponto onde atua) | proibidos | proibidos |
| `ADMIN` | proibido | proibidos | proibidos |

Os perfis `GERENTE_LOCADORA` e `ADMIN_PLATAFORMA` deixam de existir: com uma só locadora, quem
administra a loja é o `ADMIN`.

### `tipo_bicicleta`

Um "modelo" no catálogo, com tudo o que a recomendação precisa saber sobre ele:

- `altura_min_cm` e `altura_max_cm`: faixa de altura do ciclista para a qual o tipo serve
  (`altura_min_cm <= altura_max_cm`, entre 100 e 250).
- `atividades`: para o que o tipo é indicado (um ou mais valores de `atividade`).
- `nivel_recomendado`: experiência a partir da qual o tipo é confortável.
- Preços e caução em centavos inteiros (`*_centavos`), nunca em ponto flutuante.

### `bicicleta`

Uma unidade física da frota. `codigo` é o número que a locadora cola na bicicleta e é único. A
bicicleta fica em um `ponto` e só pode ser reservada quando o `status` é `DISPONIVEL`.

### `reserva`

`periodo` é um `tstzrange` (início e fim). Duas reservas ativas da mesma bicicleta não podem se
sobrepor, e quem garante isso é o banco:

```sql
ALTER TABLE reserva
  ADD CONSTRAINT reserva_sem_sobreposicao
  EXCLUDE USING gist (bicicleta_id WITH =, periodo WITH &&)
  WHERE (status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADA', 'EM_ANDAMENTO'));
```

Usa a extensão `btree_gist`, já habilitada. A reserva em `PENDENTE_PAGAMENTO` segura a bicicleta até o
pagamento ser aprovado ou a reserva expirar. A retirada e a devolução são no mesmo `ponto`.

O período tem de ser finito (`reserva_periodo_finito`, migration 0008): início e fim definidos, com o
início antes do fim; um fim aberto seguraria a bicicleta para sempre.

A função `expirar_reservas_vencidas()` (migration 0008) marca como `EXPIRADA` a reserva
`PENDENTE_PAGAMENTO` criada há 15 minutos ou mais e passa seus pagamentos `PENDENTE` para `EXPIRADO`;
devolve quantas reservas expirou. Reserva com pagamento `APROVADO` nunca expira. Não recebe
parâmetros (o prazo é regra do sistema) e roda com os direitos do dono (`SECURITY DEFINER`), porque a
RLS só mostra ao cliente as próprias reservas. É a chamada que o contrato descreve como "antes de
listar, o servidor marca como `EXPIRADA` as pendentes vencidas".

A função `unidades_livres_por_tipo(inicio, fim, ponto_id)` (migration 0009) devolve, por tipo ativo, as
unidades `DISPONIVEL` sem reserva ativa que se sobreponha ao período (`ponto_id` é opcional). É por ela
que a busca e a recomendação devem calcular `unidadesLivres`, e não por uma consulta direta em
`reserva`: com o papel do cliente a RLS esconde as reservas dos outros e a consulta direta conta como
livre uma bicicleta já reservada (medido: 190 livres contra 120 reais). A função roda com os direitos
do dono (`SECURITY DEFINER`) e devolve só contagens, nunca quem reservou.

### `pagamento`

Pix ou cartão pelo Mercado Pago, em centavos. `mp_payment_id` é único, para o mesmo aviso do Mercado
Pago (webhook) não confirmar um pagamento duas vezes. Não há tabela de plano, assinatura nem repasse.

### `movimentacao`, `ocorrencia`, `arquivo`, `notificacao` e `auditoria_log`

- **`movimentacao`:** cada retirada e devolução, com o operador, o checklist (lista em `jsonb`) e as
  fotos. Uma reserva tem no máximo uma retirada e uma devolução.
- **`ocorrencia`:** dano, atraso, furto ou acidente ligados a uma reserva e a uma bicicleta, com o
  valor cobrado se houver.
- **`arquivo`:** guarda só a chave do arquivo no armazenamento privado; o conteúdo é aberto por URL
  temporária (LGPD). A coluna `finalidade` diz de que se trata, e **exatamente uma** das colunas
  `usuario_id`, `tipo_bicicleta_id`, `movimentacao_id` e `ocorrencia_id` fica preenchida.
- **`notificacao`:** avisos ao cliente por web push, WhatsApp ou e-mail.
- **`auditoria_log`:** quem alterou o quê, com os dados antes e depois, para reservas, estoque e valores.

## Dados de recomendação

A recomendação usa estes campos, e só estes (princípio de minimização da LGPD):

| Dado | Onde fica | Para que serve |
|---|---|---|
| Altura do cliente | `usuario.altura_cm` | Filtra os tipos em que ele cabe e mede o ajuste |
| Experiência | `usuario.experiencia` | Compara com o `nivel_recomendado` do tipo |
| Atividade preferida | `usuario.atividade_preferida` | Compara com as `atividades` do tipo; pode ser trocada em cada busca |
| Período e ponto da busca | informados na busca | Mostram só os tipos com unidade livre |

Regra inicial, em duas etapas:

1. **Filtro.** Entram os tipos ativos com ao menos uma bicicleta `DISPONIVEL`, sem reserva ativa que
   se sobreponha ao período, e com `altura_min_cm <= altura do cliente <= altura_max_cm`. Se o cliente
   não informou a altura, nenhum tipo é excluído por altura.
2. **Pontuação** (de 0 a 100, pesos iniciais a calibrar com a locadora):
   - **Altura (50):** 100% no centro da faixa do tipo, caindo até 0% nas pontas.
   - **Atividade (30):** 100% se a atividade pretendida está em `atividades`, senão 0%.
   - **Experiência (20):** 100% se a experiência do cliente é igual ou maior que o
     `nivel_recomendado`, senão 0%.

   O desempate é pelo menor preço por dia. Cada resultado devolve o motivo em texto.

Detalhes da implementação (`src/modules/recomendacao`, função pura `recomendar`, com testes):

- **Dado que falta não pontua.** Sem altura, ninguém ganha os 50 pontos de altura; sem atividade
  (nem na busca nem no perfil), ninguém ganha os 30; sem experiência, ninguém ganha os 20. Assim a
  ordem continua justa entre os tipos.
- **Faixa de um valor só** (`altura_min_cm = altura_max_cm`) conta como ajuste perfeito.
- **Pontos** são arredondados para inteiro. Empate de pontos e de preço por dia é desfeito pelo nome.
- **Motivos** também avisam o que pesa contra ("Não é a mais indicada para trilha", "Recomendada a
  partir do nível intermediário", altura perto do limite da faixa).
- **Preço do aluguel** (a mesma função da reserva: `calcularValorAluguel`, em
  `src/modules/reservas/domain/preco.ts`; a recomendação não calcula preço), regra assumida (dados
  fictícios, sem locadora real; reavaliar quando houver): as horas são arredondadas para cima, cada
  bloco de 24 horas custa `preco_dia_centavos` e as horas que sobram custam `preco_hora_centavos`,
  limitadas ao preço de um dia (25 horas são 1 diária + 1 hora). Sempre em centavos inteiros.
- **Período da busca:** início e fim em ISO 8601 **com fuso**, início até 5 minutos no passado (folga
  para o tempo da requisição) e duração de 1 hora a 7 dias.

Fica para uma fase posterior usar o retorno dos clientes depois do aluguel (por exemplo, "o tamanho
ficou grande ou pequeno") para ajustar as faixas de altura de cada tipo.

## Segurança por linha

Com uma só locadora, deixa de existir o isolamento entre locadoras. A segurança por linha passa a
proteger os **dados de cada cliente**:

| Quem | O que enxerga |
|---|---|
| Visitante | Catálogo: tipos de bicicleta ativos e pontos ativos (sem dados internos) |
| Cliente | O catálogo e as próprias reservas, pagamentos e notificações |
| Operador | Tudo da operação: reservas, retiradas, devoluções e ocorrências |
| Administrador | Tudo |

O backend informa quem está logado no início de cada transação (`set_config('app.perfil', ...)` e
`set_config('app.usuario_id', ...)`, pelo helper `comSessao`). Cuidados que continuam valendo:

1. As políticas só valem para um papel **sem** `BYPASSRLS`. O dono do banco ignora a RLS; o app
   conecta com o papel `app_login`, que pertence ao grupo `app_backend` (passo a passo em
   `db/README.md`).
2. A tabela `usuario` não tem política: o login consulta a tabela antes de existir uma sessão.
   Do mesmo jeito, a busca de disponibilidade não lê `reserva` (a RLS só mostraria ao cliente as
   próprias reservas, e uma bicicleta ocupada por outra pessoa pareceria livre): ela chama
   `expirar_reservas_vencidas()` (0008) e depois `unidades_livres_por_tipo()` (0009), por ponto
   ativo. As duas são `SECURITY DEFINER` e só devolvem contagens, sem dado de cliente.
3. Quem diz o perfil da sessão é o próprio backend. A RLS protege contra um filtro esquecido no
   código, mas não contra injeção de SQL ou um backend comprometido. Toda consulta precisa usar
   parâmetros.

## Decisões

- **Identificadores:** `uuid` gerado pelo banco, sem sequência numérica previsível.
- **Datas:** `timestamptz` (UTC). `atualizado_em` é mantido por trigger.
- **Dinheiro:** inteiros em centavos.
- **E-mail:** `citext`, então `Maria@x.com` e `maria@x.com` são o mesmo e-mail.
- **Dados do cliente na tabela `usuario`:** com só três perfis, as colunas de cliente ficam na própria
  tabela, com constraints que as exigem para `CLIENTE` e as proíbem para os outros perfis. Se
  crescerem, podem ir para uma tabela `cliente`.
- **Localização do ponto:** `geography(Point, 4326)` é opcional. Serve para mostrar o ponto no mapa e a
  distância até o cliente. Se a locadora tiver um ponto só, o PostGIS pode ser dispensado.
- **Documento do cliente:** só a chave do arquivo fica no banco; o arquivo fica em armazenamento privado.

## Do modelo anterior para este

| Hoje (migrations `0001` a `0003`) | No modelo novo |
|---|---|
| Tabela `locadora` (várias linhas, com CNPJ, status, comissão e conta de recebimento) | Tabela `empresa` com uma linha só; sem status, comissão nem repasse |
| `ponto.locadora_id` e nome único por locadora | Coluna removida; nome único no banco todo |
| `usuario.locadora_id` e `usuario.nivel_acesso` | Colunas removidas |
| Perfis `CLIENTE`, `OPERADOR`, `GERENTE_LOCADORA` e `ADMIN_PLATAFORMA` | Perfis `CLIENTE`, `OPERADOR` e `ADMIN` |
| `usuario.altura_cm` | Mantida; entram `experiencia` e `atividade_preferida` |
| Views `locadora_catalogo` e `locadora_equipe` | Removidas |
| Políticas de RLS de `locadora` e `ponto`; funções `sessao_locadora_id`, `locadora_esta_ativa` e `locadora_protege_campos` | Removidas; novas políticas por cliente em reserva, pagamento e notificação |
| Papel `app_backend` e tabela `limite_tentativas` | Mantidos (as permissões são ajustadas) |
| Ainda não existiam: tipo de bicicleta, bicicleta, reserva, pagamento, movimentação, ocorrência, arquivo, notificação e auditoria | Entram nas migrations seguintes, junto de cada módulo |
| Tabelas previstas no modelo anterior e que **não** serão criadas: plano, assinatura e repasse | Fora do escopo |
