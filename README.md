# Bike Ilha Club

Aplicativo de aluguel de bicicletas que reúne várias locadoras de São Luís (MA) em um só
lugar. O cliente
encontra a locadora mais próxima, vê a galeria de bicicletas disponíveis na data e no período
desejados e escolhe a bicicleta certa para o seu tamanho e para a atividade que vai fazer.

O aplicativo não cria um negócio novo: ele organiza, digitaliza e amplia operações de
locadoras que já existem, cobrindo cadastro de clientes e locadoras, busca, reservas, cobrança
e registro de retiradas e devoluções.

## Status do projeto

Fase de proposta/documentação, com o esqueleto do projeto Next.js (TypeScript, ESLint e módulos do back-end em `src/modules`) já configurado.

## Objetivo geral

Disponibilizar um aplicativo que permita aos clientes encontrar a locadora mais próxima e
reservar e pagar o aluguel de bicicletas em São Luís, e às locadoras gerenciar frota, pontos,
reservas e ocorrências.

### Objetivos específicos

- Cadastrar clientes, com envio de documento e aceite dos termos de uso.
- Cadastrar locadoras, com seus pontos de retirada, operadores e catálogo próprio.
- Localizar as locadoras mais próximas do cliente.
- Exibir a galeria de bicicletas disponíveis na data e no período escolhidos, com filtro por
  altura do ciclista e por atividade.
- Controlar a disponibilidade de cada bicicleta por período.
- Cobrar o aluguel por Pix e cartão e permitir assinatura recorrente, com repasse às locadoras.
- Registrar retirada e devolução com checklist e fotos.
- Oferecer um painel administrativo a cada locadora e outro à plataforma.

## Escopo

Atende exclusivamente a cidade de São Luís (MA) e locadoras sediadas nela. Ficam fora do
escopo inicial a operação em outras cidades e a devolução em ponto diferente do de retirada.

## Público-alvo

O projeto tem dois tipos de cliente, dos dois lados da plataforma:

- **Locadoras (quem disponibiliza as bikes):** empresas que já alugam bicicletas em São Luís
  e passam a oferecer o aluguel também pelo aplicativo. Cadastram seus pontos de retirada,
  operadores e catálogo de bicicletas (tipos, unidades, preços, regras de caução e
  documentos exigidos), e gerenciam frota, reservas e financeiro pelo painel administrativo.
- **Clientes (quem aluga):** pessoas que querem alugar uma bicicleta em São Luís. Fazem
  cadastro com documento e aceite dos termos, buscam a locadora mais próxima, filtram as
  bicicletas por altura e atividade, reservam, pagam e retiram/devolvem no ponto escolhido.

## Arquitetura proposta

**Estilo:** monólito modular — uma única aplicação Next.js (front-end e back-end no mesmo
projeto), dividida internamente em módulos com fronteiras claras, permitindo extração futura
caso algum módulo precise escalar separadamente.

### Pilha tecnológica

| Camada | Tecnologia |
|---|---|
| Aplicativo e painéis | Next.js (React) com TypeScript, PWA |
| Backend | TypeScript (Route Handlers do Next.js) |
| Banco de dados | PostgreSQL gerenciado (ex.: Neon) com extensão PostGIS |
| Mapas e localização | Geolocalização do navegador + serviço de mapas (Google Maps/Mapbox) |
| Pagamentos | Mercado Pago (Pix, cartão, assinaturas, repasse) |
| Notificações | Web push (PWA), WhatsApp API, e-mail transacional |
| Arquivos | Armazenamento de objetos privado (Vercel Blob ou compatível com S3) |
| Hospedagem | Vercel, com HTTPS |

### Módulos do sistema

Contas · Locadoras · Catálogo e estoque · Busca · Reservas · Pagamentos · Operação ·
Administração · Notificações.

### Principais entidades de dados

Usuário, Locadora, Ponto, Tipo de bicicleta, Bicicleta, Plano, Assinatura/crédito, Reserva,
Movimentação, Ocorrência, Pagamento.

Reservas sobrepostas para a mesma bicicleta são impedidas por uma *exclusion constraint* no
PostgreSQL. Multilocação é garantida por identificador de locadora em cada registro e por
row-level security.

## Requisitos não funcionais

- Desempenho: respostas rápidas, inclusive em conexão móvel.
- Usabilidade: aplicativo em português, instalável como PWA.
- Segurança: HTTPS, senhas com hash, controle de acesso por perfil.
- Multilocação: isolamento dos dados de cada locadora.
- Privacidade: conformidade com a LGPD (Lei nº 13.709/2018).
- Disponibilidade: backups automáticos diários.
- Auditoria: registro de alterações em reservas, estoque e valores.

## Riscos principais

- Furto ou dano de bicicletas.
- Adesão insuficiente (plataforma depende de locadoras e clientes simultaneamente).
- Qualidade dos cadastros/catálogos.
- Regras de repasse e responsabilidade entre plataforma e locadoras.
- Inadimplência de assinaturas.
- Notificações push limitadas no iPhone (WhatsApp como canal principal).
- Tratamento de dados pessoais (LGPD).

## Próximos passos

- Detalhar o diagrama entidade-relacionamento.
- Definir o modelo de comissão e repasse às locadoras.
- Definir planos e cauções.
- Planejar a integração com o Mercado Pago.

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:3000 — health check em /api/health
npm run lint
npm run typecheck
npm run build
```

Estrutura do back-end: um diretório por módulo em `src/modules/<modulo>` (`contas`,
`locadoras`, `catalogo`, `busca`, `reservas`, `pagamentos`, `operacao`, `administracao`,
`notificacoes`), cada um com as camadas `domain`, `application`, `infrastructure` e `http` e
uma API pública em `index.ts`. Os Route Handlers ficam em `src/app/api` e só importam os
módulos pelo `index.ts` (regra imposta pelo ESLint). Código comum fica em `src/shared`.
