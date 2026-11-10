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
