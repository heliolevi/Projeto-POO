# Design system: tokens (cores, tipografia, espaços)

Fonte única de verdade: [`src/app/globals.css`](../src/app/globals.css), como variáveis CSS
(`:root`). Qualquer CSS Module ou estilo inline do app usa essas variáveis — nunca um valor de
cor, tamanho de fonte ou espaçamento solto no meio do componente.

## Cores

Vêm do Figma do Bike Ilha Club (telas de login e cadastro). Agrupadas por função, não por nome
da cor, para ficar claro onde cada uma se aplica.

### Principais

| Token | Valor | Uso |
|---|---|---|
| `--color-logo` | `#0d7a5f` | Traço do ícone da marca |
| `--color-primary` | `#005f49` | Ações principais (botão, links de destaque) |
| `--color-text` | `#13182e` | Texto principal |
| `--color-surface` | `#ffffff` | Superfície branca (cards, inputs em foco) |
| `--color-bg-lavender` | `#faf8ff` | Fundo da página |

### Superfícies

| Token | Valor | Uso |
|---|---|---|
| `--color-surface-soft` | `#f2f3ff` | Fundo padrão de input |
| `--color-surface-sand` | `#fff4a6` | Gradiente do banner |
| `--color-surface-lavender` | `#e2e7ff` | Gradiente do banner |
| `--color-surface-border` | `#eaedff` | Borda suave |
| `--color-surface-border-strong` | `#dae2fd` | Borda de input |

### Ações e destaque

| Token | Valor | Uso |
|---|---|---|
| `--color-mint-highlight` | `#98f4d3` | Gradiente do banner |
| `--color-mint-secondary` | `#7cd8bb` | Reforço de destaque |
| `--color-mint-badge` | `#a8ffdf` | Badge sobre menta |
| `--color-link-blue` | `#005886` | Links dentro de texto (termos de uso, etc.) |

### Acentos

| Token | Valor | Uso |
|---|---|---|
| `--color-orange-dark` | `#9d4300` | Texto do selo "eyebrow" |
| `--color-orange-vivid` | `#fd761a` | Acento vivo |

### Neutros

| Token | Valor | Uso |
|---|---|---|
| `--color-text-secondary` | `#3e4944` | Texto secundário |
| `--color-text-support` | `#667a74` | Texto de apoio (placeholder, legenda) |
| `--color-border` | `#bdc9c2` | Borda neutra (botão voltar) |
| `--color-bg-dark` | `#283044` | Fundo escuro (reservado) |
| `--color-text-light` | `#e6f0ff` | Texto claro sobre fundo escuro |
| `--color-text-on-mint` | `#002117` | Texto sobre fundo menta |

### Feedback

| Token | Valor | Uso |
|---|---|---|
| `--color-danger` | `#c0392b` | Erro de validação |
| `--color-danger-soft` | `#fdecea` | Fundo de erro (Alert, Badge perigo) |
| `--color-info-soft` | `#e6f1f8` | Fundo de informação (Alert, Badge info) |
| `--color-info-border` | `#b3d4e8` | Borda do Alert de informação |
| `--color-overlay` | `rgba(19, 24, 46, 0.5)` | Fundo escurecido atrás do Modal |

## Tipografia

Duas famílias, carregadas via `next/font/google` em `src/app/layout.tsx`:

- **Space Grotesk** (`--font-heading`) — títulos e preços em destaque.
- **Plus Jakarta Sans** (`--font-body`) — texto e UI (o `body` usa essa por padrão).

### Escala de tamanho

| Token | Valor | Uso |
|---|---|---|
| `--font-size-xs` | 11px | Selo pequeno (`bannerTag`) |
| `--font-size-sm` | 12px | Texto de apoio, hint, erro |
| `--font-size-base` | 13px | Label de campo, texto de checkbox, link |
| `--font-size-md` | 14px | Corpo de texto, subtítulo, input |
| `--font-size-lg` | 15px | Texto de botão |
| `--font-size-xl` | 18px | Nome da marca no cabeçalho |
| `--font-size-2xl` | 24px | Título de tela |

### Peso

| Token | Valor |
|---|---|
| `--font-weight-regular` | 400 |
| `--font-weight-semibold` | 600 |
| `--font-weight-bold` | 700 |

## Espaços

Escala fixa — todo `gap`, `padding` e `margin` entre elementos usa um destes valores:

| Token | Valor |
|---|---|
| `--space-4` | 4px |
| `--space-6` | 6px |
| `--space-8` | 8px |
| `--space-10` | 10px |
| `--space-12` | 12px |
| `--space-14` | 14px |
| `--space-16` | 16px |
| `--space-20` | 20px |
| `--space-24` | 24px |
| `--space-32` | 32px |
| `--space-48` | 48px |

Fora da escala ficam as **dimensões fixas de controle** (altura de input/botão, tamanho de ícone
e de checkbox, como `48px`, `50px`, `18px`), porque não são espaço entre elementos — são o
tamanho do próprio componente. Se aparecer um padrão repetido entre esses valores, vira um token
de tamanho (`--size-*`) numa revisão futura.

## Raio e sombra

| Token | Valor | Uso |
|---|---|---|
| `--radius-sm` | 10px | Input, botão, banner de erro |
| `--radius-md` | 16px | Reservado |
| `--radius-lg` | 24px | Banner |
| `--radius-pill` | 999px | Botão voltar, selos, badges |
| `--shadow-card` | `0 12px 32px -16px rgba(19, 24, 46, 0.25)` | Elevação de card (reservado) |

## Como usar

- CSS Module: `padding: var(--space-16);`
- Estilo inline (quando o componente não tem CSS Module próprio): `style={{ gap: "var(--space-10)" }}`.
- Nunca repetir o valor hexadecimal, o tamanho de fonte ou o espaçamento direto no componente —
  sempre pelo token. Facilita trocar o valor em um lugar só e evita a UI ir se desalinhando aos
  poucos conforme cada tela inventa o próprio número.

## Componentes

Todos em `src/shared/ui`, com CSS Module próprio e só tokens (nada de valor solto). Os nomes das
props seguem o que o projeto já usa nos componentes de formulário.

| Componente | Para que serve | Props principais |
|---|---|---|
| `Card` | Bloco de conteúdo com borda, sombra e cabeçalho opcional | `title`, `action`, `footer`, `as`, `interactive` |
| `Badge` | Selo curto de status | `variant`: `neutro`, `sucesso`, `aviso`, `perigo`, `info` |
| `Alert` | Mensagem destacada (erro, aviso, sucesso, informação) | `variant`: `info`, `sucesso`, `aviso`, `erro`; `title`, `action` |
| `Select` | Lista de opções, com rótulo, erro e dica como o `TextField` | `label`, `opcoes` (`{ valor, rotulo }`), `placeholder`, `error`, `hint` |
| `Table` | Tabela tipada, com legenda para leitores de tela e rolagem horizontal | `legenda`, `colunas`, `linhas`, `chaveDaLinha`, `vazio` |
| `Modal` | Janela de diálogo sobre a página (usa o `<dialog>` nativo) | `aberto`, `onFechar`, `titulo`, `rodape` |
| `EmptyState` | Tela ou lista sem conteúdo, com uma ação sugerida | `title`, `action` |

Acessibilidade: `Alert` usa `role="alert"` para erro e aviso e `role="status"` para informação e
sucesso; `Select` liga o erro ao campo com `aria-describedby`; `Modal` herda foco e camada do
`<dialog>` e chama `onFechar` uma vez só (Esc, clique no fundo ou botão), sempre deixando o pai decidir; `Table` traz `<caption>` e `scope="col"`.

Quando o app precisar de um componente que não está aqui, ele entra neste mesmo lugar (e nesta
tabela) em vez de nascer dentro de uma tela.

## Estados de tela e mensagens

Toda tela que busca dados na API passa por quatro estados, sempre com os mesmos componentes:

| Estado | Como mostrar |
|---|---|
| Carregando | Texto curto com `role="status"` ("Carregando suas reservas...") |
| Vazio | `EmptyState`, com uma ação sugerida quando fizer sentido (ex.: "Buscar uma bicicleta") |
| Erro | `Alert` com `variant="erro"`; se tentar de novo resolver, oferecer o botão |
| Pronto | O conteúdo |

**Mensagens de erro.** O `api-cliente` já converte o que a API devolve em texto para a pessoa
(`src/shared/http/mensagens.ts`): limite de tentativas (429), erro do servidor (5xx), pagamento fora do
ar e tamanho excedido ganham um texto amigável; validação, 401, 404 e 409 mantêm a mensagem da API, que
já é específica. Rede caída vira `ApiError` com código `NETWORK_ERROR` ("Sem conexão com a internet").
As telas só mostram `erro.message`.

**Páginas de segurança.** `src/app/not-found.tsx` (404) e `src/app/error.tsx` (erro inesperado, com
"Tentar de novo") evitam a página em branco.

**Responsividade e acessibilidade.** A coluna do app tem 430 px no celular e 640 px a partir de 768 px.
A barra de navegação fica fixa no rodapé e respeita a área segura do iPhone. Campos têm 16 px em telas
pequenas (menos que isso dá zoom no iOS), todo elemento focável tem contorno visível no teclado e quem
pede menos movimento no sistema não vê animações.
