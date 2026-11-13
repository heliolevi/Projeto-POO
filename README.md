# Bike Ilha Club

Sistema de aluguel de bicicletas de uma locadora de São Luís (MA), com recomendação da bicicleta
certa para cada cliente. O cliente escolhe a data e o período, vê as bicicletas disponíveis já
ordenadas pela adequação à sua altura, à sua experiência e à atividade que vai fazer, reserva, paga
e retira a bicicleta no ponto da locadora.

O sistema não cria um negócio novo: ele organiza e digitaliza a operação de uma locadora que já
existe, cobrindo cadastro de clientes, catálogo, recomendação, reservas, cobrança e registro de
retiradas e devoluções.

> **Mudança de escopo (novembro de 2026).** Por sugestão do professor, o projeto deixou de ser uma
> plataforma que reúne várias locadoras e passou a atender **uma única locadora**. O que mudou, o
> que sai e o plano de trabalho estão em [docs/mudanca-de-escopo.md](docs/mudanca-de-escopo.md).

## Status do projeto

Em desenvolvimento, para uma única locadora (migrations `0001` a `0009` aplicadas na `dev`).
Já existem contas (cadastro, login e gestão da conta), catálogo, recomendação e as telas de
busca, reserva, Minhas reservas, perfil do ciclista e pagamento. O **MVP da interface** é entregue
em 13/11/2026 e o **sistema completo**, com reservas, pagamento simulado, operação e o código
reorganizado em **orientação a objetos** (requisito da disciplina de POO), em **19/11/2026**.
O cronograma está em [docs/andamento-do-projeto.md](docs/andamento-do-projeto.md) e o modelo de
dados em [docs/modelo-de-dados.md](docs/modelo-de-dados.md).

## Objetivo geral

Disponibilizar um sistema que permita aos clientes reservar e pagar o aluguel de bicicletas da
locadora, recebendo uma recomendação da bicicleta mais adequada ao seu perfil, e à locadora
gerenciar frota, reservas e ocorrências.

### Objetivos específicos

- Cadastrar clientes, com envio de documento, aceite dos termos de uso e os dados usados na
  recomendação (altura, experiência e atividade preferida).
- Manter o catálogo da locadora: tipos de bicicleta, unidades da frota, preços, caução e pontos de
  retirada.
- Exibir as bicicletas disponíveis na data e no período escolhidos, ordenadas por uma recomendação
  baseada nos dados do cliente.
- Controlar a disponibilidade de cada bicicleta por período, sem reservas sobrepostas.
- Cobrar o aluguel por Pix e cartão.
- Registrar retirada e devolução com checklist e fotos, e registrar ocorrências (dano, atraso,
  furto).
- Oferecer um painel administrativo para a locadora.
- Avisar o cliente sobre a reserva, a retirada e a devolução.

## Escopo

Atende uma única locadora, sediada em São Luís (MA). A devolução é feita no mesmo ponto da retirada.

Ficam fora do escopo inicial:

- várias locadoras na mesma plataforma, busca da locadora mais próxima, comissão e repasse;
- assinatura recorrente e créditos (podem entrar numa fase posterior);
- operação em outras cidades;
- devolução em ponto diferente do de retirada.

## Público-alvo

- **Locadora (a empresa dona das bicicletas):** cadastra os tipos de bicicleta, as unidades, os
  preços, a caução e os pontos de retirada, e gerencia frota, reservas e ocorrências pelo painel
  administrativo. A equipe tem dois perfis: **administrador** (gestão completa) e **operador**
  (atendimento no ponto: retirada, devolução e ocorrências).
- **Clientes (quem aluga):** pessoas que querem alugar uma bicicleta em São Luís. Fazem cadastro com
  documento e aceite dos termos, informam altura, experiência e a atividade que pretendem fazer,
  recebem a recomendação, reservam, pagam e retiram e devolvem a bicicleta no ponto.

## Recomendação da bicicleta

A recomendação usa os dados do cliente para ordenar as bicicletas disponíveis, e começa com regras
simples e explicáveis (sem aprendizado de máquina):

1. **Filtros:** só entram os tipos de bicicleta que têm unidade livre no período e que servem para a
   altura do cliente.
2. **Pontuação:** ajuste à altura (quão no centro da faixa do tipo o cliente está), atividade
   pretendida e experiência do cliente em relação ao nível do tipo.
3. **Explicação:** cada bicicleta mostra o motivo da recomendação (por exemplo, "Cabe na sua altura de
   172 cm" e "Boa para trilha").

Os pesos da pontuação são uma proposta inicial e serão calibrados com a locadora. Os campos usados e
as regras estão em [docs/modelo-de-dados.md](docs/modelo-de-dados.md).

## Arquitetura proposta

**Estilo:** monólito modular — uma única aplicação Next.js (front-end e back-end no mesmo
projeto), dividida internamente em módulos com fronteiras claras, permitindo extração futura
caso algum módulo precise escalar separadamente.

### Pilha tecnológica

| Camada | Tecnologia |
|---|---|
| Aplicativo e painel | Next.js (React) com TypeScript, PWA |
| Backend | TypeScript (Route Handlers do Next.js) |
| Banco de dados | PostgreSQL gerenciado (ex.: Neon). A extensão PostGIS é opcional: só é necessária se a locadora tiver mais de um ponto e se quiser mostrar distâncias |
| Mapas | Serviço de mapas (Google Maps/Mapbox) apenas para mostrar o(s) ponto(s) de retirada |
| Pagamentos | Mercado Pago (Pix e cartão) |
| Notificações | Web push (PWA), WhatsApp API, e-mail transacional |
| Arquivos | Armazenamento de objetos privado (Vercel Blob ou compatível com S3) |
| Hospedagem | Vercel, com HTTPS |

### Módulos do sistema

Contas · Catálogo e estoque · Busca e recomendação · Reservas · Pagamentos · Operação ·
Administração · Notificações.

O módulo `locadoras` do modelo anterior deixa de existir: os dados da empresa e os pontos de retirada
passam para Administração, e o catálogo (tipos e unidades de bicicleta) fica em Catálogo e estoque.

### Principais entidades de dados

Usuário, Empresa (um único registro), Ponto, Tipo de bicicleta, Bicicleta, Reserva, Pagamento,
Movimentação (retirada e devolução), Ocorrência, Arquivo, Notificação e Registro de auditoria.

Reservas sobrepostas para a mesma bicicleta são impedidas por uma *exclusion constraint* no
PostgreSQL. Cada cliente só enxerga os próprios dados (reservas, pagamentos e notificações), garantido
por row-level security.

## Requisitos não funcionais

- Desempenho: respostas rápidas, inclusive em conexão móvel.
- Usabilidade: aplicativo em português, instalável como PWA.
- Segurança: HTTPS, senhas com hash, controle de acesso por perfil.
- Privacidade: conformidade com a LGPD (Lei nº 13.709/2018), guardando só os dados necessários para
  a locação e para a recomendação.
- Disponibilidade: backups automáticos diários.
- Auditoria: registro de alterações em reservas, estoque e valores.

## Riscos principais

- Furto ou dano de bicicletas.
- Qualidade dos dados informados pelo cliente: uma altura errada leva a uma recomendação ruim.
- Qualidade do cadastro do catálogo (faixas de altura e atividades de cada tipo).
- Cliente que reserva e não retira a bicicleta.
- Depender de uma única locadora: o sistema só tem valor com a frota e os preços dela.
- Notificações push limitadas no iPhone (WhatsApp como canal principal).
- Tratamento de dados pessoais (LGPD).

## Próximos passos

- Confirmar com a locadora o número de pontos, os dados da empresa e os critérios da recomendação.
- Aplicar a migration que simplifica o banco para uma locadora (plano em
  [docs/mudanca-de-escopo.md](docs/mudanca-de-escopo.md)).
- Implementar catálogo, busca com recomendação e reservas.
- Planejar a integração com o Mercado Pago (Pix e cartão).

## Desenvolvimento

```bash
npm ci
npm run dev        # http://localhost:3000 — health check em /api/health
npm run lint
npm run typecheck
npm test
npm run build
```

Para rodar o projeto do zero (Node 22.18 ou mais novo, variáveis do `.env.local`, banco, seed, conta
de equipe e testes), siga o [guia de ambiente local](docs/ambiente-local.md).

**Orientação a objetos.** O domínio e os serviços seguem o diagrama de classes
(`docs/diagrama-de-classes.pdf`): classes com atributos privados, herança (`Usuario` com `Cliente`,
`Operador` e `Admin`), polimorfismo e interfaces para repositórios e serviços externos. As regras de
estilo, o mapa classe a classe e como criar uma classe nova estão em
[docs/arquitetura-oo.md](docs/arquitetura-oo.md).

Estrutura do back-end: um diretório por módulo em `src/modules/<modulo>`, cada um com as camadas
`domain`, `application`, `infrastructure` e `http` e uma API pública em `index.ts`. Os Route Handlers
ficam em `src/app/api` e só importam os módulos pelo `index.ts` (regra imposta pelo ESLint). Código
comum fica em `src/shared`. Os módulos são `contas`, `catalogo`, `recomendacao`, `reservas`,
`pagamentos`, `operacao`, `administracao` e `notificacoes` (o `locadoras` do modelo anterior saiu e
`busca` passou a se chamar `recomendacao`).

### Como trabalhar em equipe

Branches, mensagens de commit, pull requests e revisão seguem o combinado em
[docs/estrategia-de-commits.md](docs/estrategia-de-commits.md).

### Banco de dados

O app lê `DATABASE_URL` (conexão com pooler) do `.env`; veja `.env.example`. A conexão fica em
`src/shared/db` (`getPool()` e `query()`, pool criado no primeiro uso). Com o banco configurado,
`GET /api/health/db` mostra o banco, a versão do PostGIS e quantas migrations foram aplicadas.
As migrations usam a conexão direta (`DATABASE_URL_UNPOOLED`) e rodam com `npm run migrar`
dentro de `db/` (veja `db/README.md`).
