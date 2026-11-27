# Orientação a objetos no Bike Ilha Club

O domínio do sistema é modelado com classes, herança, polimorfismo e encapsulamento. Este documento
mostra onde cada pilar está no código, como as classes se ligam ao
[diagrama de classes](diagrama-de-classes.pdf) e quais escolhas foram feitas.

## Onde ficam as classes

Cada módulo de `src/modules/<modulo>` tem as camadas `domain`, `application`, `infrastructure` e `http`.
As **classes** moram em `domain`. Os **serviços** (classes de aplicação) moram em `application`. O
repositório converte a linha do banco em objeto e a classe devolve, por um método, o formato que o contrato
da API pede. Por isso rotas, JSON das respostas, migrations e telas não mudaram.

| Módulo | Classes |
|---|---|
| `shared/dominio` | `Dinheiro`, `Periodo` (objetos de valor); a regra de preço do aluguel (`preco-aluguel.ts`) e o prazo de pagamento (`prazos.ts`) |
| `contas` | `Usuario` (abstrata), `Cliente`, `Operador`, `Admin` |
| `catalogo` | `Empresa`, `Ponto`, `TipoBicicleta`, `Bicicleta` |
| `recomendacao` | `RecomendacaoService`, `CriterioDeRecomendacao` (interface), `CriterioAltura`, `CriterioAtividade`, `CriterioExperiencia` |
| `reservas` | `Reserva`, `ReservaService` |
| `pagamentos` | `Pagamento` (abstrata), `PagamentoPix`, `PagamentoCartao`, `PagamentoService`, `PagarReservaService`, `IntervaloDeConsulta`, `GatewayPix` (interface), `GatewayStripe`, `CodigoPix` (objeto de valor) |
| `operacao` | `Movimentacao`, `Checklist`, `ItemDoChecklist`, `OperacaoService`, `Ocorrencia` (abstrata), `Dano`, `Atraso`, `Furto`, `Arquivo` |
| `notificacoes` | `Notificacao`, `EnviadorDeNotificacao` (interface), `RoteadorDeEnvio` |
| `administracao` | `AuditoriaLog` |
| `shared/empresa` (telas) | `EmpresaDaLocadora`, `PontoDeRetirada`, `GradeDeHorarios`, `HorarioDoDia`, `LeitorDeObjeto`, `BuscadorDeEmpresa`, `ResultadoDaEmpresa` (abstrata), `EmpresaCarregada`, `EmpresaSemCadastro`, `EmpresaIndisponivel` |
| `shared/http` | `Resposta`, `LeitorDeCorpo`, `ClienteDaRequisicao`, `SegredoBearer`, `PerfisPermitidos`, `TradutorDeErros`, `ClienteApi` |
| `shared/db` | `BancoDeDados`, `TransacaoComSessao`, `LimiteDeTentativas`, `VerificadorDoBanco` |
| `shared/auth` | `Sessao`, `ArmazemDeSessao`, `DestinoSeguro` |
| `shared/config` | `Ambiente` |
| `shared/dominio` (documentos e senha) | `Cpf`, `Cnpj`, `PoliticaDeSenha` |
| `shared/format` | `FormatadorDeData` |

## Os quatro pilares

### Encapsulamento

- Todo campo é privado (`#campo`). Nenhuma classe tem campo visível: `Object.keys(objeto)` é vazio e o
  JSON só sai por um método (`paraDto()`, `paraPublico()`, `toJSON()`).
- O estado só muda por métodos que conferem a regra. Exemplo: o status de `Reserva` muda por
  `confirmar()`, `cancelar()`, `iniciar()`, `concluir()`, `expirar()` e `marcarNaoRetirada()`; todos
  consultam a mesma tabela `TRANSICOES` e uma transição inválida lança `TransicaoDeReservaInvalida`
  (409), deixando a reserva como estava.
- O que uma classe devolve é cópia (datas, listas, objetos), então ninguém altera o estado por fora. Um
  teste percorre todos os getters de todas as classes para garantir isso.
- Dados sensíveis não saem: `Usuario` não expõe o hash da senha (só `hashParaPersistir()`, para o repositório
  gravar), `Arquivo` só dá a chave por `paraPersistir()` e `AuditoriaLog` troca senha e token por
  `[REDIGIDO]`.
- `Dinheiro` guarda centavos inteiros e `Periodo` exige início antes do fim: nenhuma regra de negócio recebe
  um valor quebrado ou um intervalo invertido. `CodigoPix` guarda o copia e cola e decide uma vez, no
  construtor privado, se ele é um BR Code de verdade (`pagavelEmBanco`); só nasce pela fábrica
  `CodigoPix.de(texto)` e não muda depois. Nenhuma parte do código lê o relógio dentro do domínio:
  quem chama passa `agora`.

### Herança

```
Usuario (abstrata)             Pagamento (abstrata)          Ocorrencia (abstrata)
 ├── Cliente                    ├── PagamentoPix              ├── Dano
 ├── Operador                   └── PagamentoCartao           ├── Atraso
 └── Admin                          (crédito ou débito)       └── Furto
```

A classe abstrata guarda o que é comum e as filhas acrescentam o que é próprio. `Usuario` tem identidade,
senha e situação da conta; `Cliente` acrescenta o perfil de ciclista e o aceite dos termos; `Operador`, o
ponto em que atua. `Pagamento` tem valor, ciclo de vida e estorno; `PagamentoPix` acrescenta o prazo do Pix
e o código.

### Composição

Nem tudo é herança. `PagamentoPix` **tem um** `CodigoPix` (e não **é um**): o pagamento cuida do prazo e
do ciclo de vida, e o código cuida do formato do Banco Central (campos EMV, moeda 986, país BR, conta
`br.gov.bcb.pix` e o CRC16 do campo 63). Cada classe tem uma responsabilidade só: trocar a forma de
validar o código não mexe no pagamento, e `pix.pagavelEmBanco` na resposta é só
`pagamento.pagavelEmBanco`, que pergunta ao código. Do mesmo jeito, `Reserva` tem um `Periodo` e um
`Dinheiro`.

### Polimorfismo

- `Usuario.permissoes()`: cada perfil devolve a sua lista. O mesmo código (`usuario.temPermissao(...)`)
  decide o acesso sem olhar o perfil. O administrador reaproveita a lista do operador.
- `Pagamento.gerar()`: Pix devolve o copia e cola (e se ele é pagável em banco); cartão devolve o final
  do cartão. Quem chama usa `Pagamento` e não sabe qual é.
- `GatewayPix` (interface): os casos de uso de pagamento falam com ela; a Stripe de verdade fica em
  `infrastructure/gateway-stripe.ts` e os testes passam uma de mentira. O sistema não depende da Stripe,
  depende do contrato (inversão de dependência).
- `Ocorrencia.valorSugerido()`: `Dano` usa o custo estimado, `Atraso` aplica a tolerância e a regra de hora
  cheia, `Furto` cobra a caução quando não há estimativa.
- `CriterioDeRecomendacao.avaliar()`: o `RecomendacaoService` soma os critérios sem saber quais são. Um
  critério novo entra na lista do construtor sem mexer no serviço.
- `EnviadorDeNotificacao.enviar()`: o `RoteadorDeEnvio` escolhe o enviador pelo canal (web push, WhatsApp
  ou e-mail), e a `Notificacao` só conhece a interface.
- Fábricas escolhem a subclasse certa: `criarUsuario(linha)`, `criarPagamento(metodo, dados)` e
  `abrirOcorrencia(tipo, dados)`.

### Abstração e interfaces

- Classes abstratas: `Usuario`, `Pagamento`, `Ocorrencia`.
- Interfaces (tipos de contrato): `CriterioDeRecomendacao`, `EnviadorDeNotificacao`, `ServicoDeSenha`
  (o domínio conhece só o contrato; o scrypt fica em `infrastructure`), `RepositorioDePagamentos`,
  `Assinador` (URL assinada do armazenamento), `ReservaOperavel` e `OperadorDoBalcao` (a operação depende
  destes contratos, não das classes de outros módulos).

## Exceções e coleções

- Hierarquia de erros: `AppError` e subclasses (`ValidationError`, `NotFoundError`, `ConflictError` ...) em
  `src/shared/http/errors.ts`, mapeadas para 400, 401, 403, 404, 409, 413 e 429. As regras do domínio criam
  subclasses de `ConflictError`: `TransicaoDeReservaInvalida`, `TransicaoDePagamentoInvalida`,
  `TransicaoDeBicicletaInvalida`, `OcorrenciaInvalida`, `MovimentacaoInvalida` e `NotificacaoInvalida`.
- Coleções com tipos genéricos: `Map`, `Set`, `Record<K, V>` e arrays tipados (`readonly Periodo[]`,
  `Map<CanalDeNotificacao, EnviadorDeNotificacao>`).

## Como o diagrama de classes ficou no código

O diagrama é o ponto de partida. Estes são os pontos em que o código decidiu diferente, com o motivo:

| Diagrama | Código | Motivo |
|---|---|---|
| `Cliente.listarReservas()` | `ReservaService.listarReservas(sessao, filtros)` | Listar consulta o banco, e o domínio não conhece o banco. |
| `Operador.registrarRetirada()` e `registrarDevolucao()` | `OperacaoService.registrarRetirada()` e `registrarDevolucao()` | A operação coordena `Reserva`, `Movimentacao` e `Ocorrencia`; o `Operador` só diz em que ponto atua (`podeAtuarNoPonto`). |
| `Operador.abrirOcorrencia()` | `OperacaoService.abrirOcorrencia()` | Mesmo motivo. |
| `Admin.cadastrarTipo()`, `cadastrarBicicleta()`, `consultarAuditoria()` | Casos de uso do catálogo e `AuditoriaLog.consultar()` | O administrador é identificado pela permissão (`catalogo:gerir`), e o caso de uso faz a operação. |
| `TipoBicicleta.calcularPreco(): number` | Devolve `Dinheiro` | O valor em centavos é um objeto de valor; `.centavos` dá o número. |
| `Reserva.cancelar(motivo)`, `confirmar()` ... | Recebem `agora`; `cancelar` não recebe nem guarda motivo | O domínio não lê o relógio, para toda regra de tempo ser testável. O motivo e a data do cancelamento não têm onde ser gravados (o banco grava `cancelada_em` com a própria hora), então o objeto não os carrega. |
| `Reserva.calcularValor()` | `calcularValor(precos)` | O preço vem do tipo, que a reserva não guarda. |
| `Pagamento.gerarPix()` e `cobrarCartao(token)` | Estão nas filhas, não na abstrata | Só o Pix gera Pix e só o cartão cobra cartão; a abstrata tem `gerar()`. |
| `Ocorrencia.abrir()` | A fábrica `abrirOcorrencia(tipo, dados)` | Uma ocorrência já nasce aberta. |
| `Ocorrencia.cobrarCliente(valor): Pagamento` | Devolve a divisão `{ daCaucao, adicional }` | Criar o `Pagamento` é do módulo de pagamentos; a operação só diz quanto sai da caução e quanto passa dela. |
| `Notificacao.enviar()` | `enviar(enviador, agora)` | O canal de envio entra como dependência (a interface). |
| `AuditoriaLog.registrar(...)` | Método estático que cria o registro | Cada registro é imutável depois de criado. |

## Regras assumidas

Dados e regras que a documentação marca como assumidos (não há locadora real). Revisar quando houver:

- **Atraso** (`docs/dados-da-locadora.md`, seção 6): tolerância de 15 minutos; depois, hora iniciada conta
  como hora cheia e, a cada 24 horas de atraso, o valor não passa de uma diária. É a mesma conta do aluguel.
- **Dano e furto:** o custo sai da caução e, se passar dela, o resto é cobrado do cliente.
- **Retirada:** a partir de 30 minutos antes do início da reserva e até o fim do período.
- **Pagamento:** Pix pela Stripe; `mp_payment_id` guarda o id do PaymentIntent (`pi_...`). Com a chave de
  teste o copia e cola é fictício (`pagavelEmBanco: false`); com a de produção, é o BR Code de verdade. O Pix
  vale 15 minutos, como a reserva pendente. Pix pago depois de a reserva cair é devolvido inteiro (`ESTORNADO`).
- **Tipos de ocorrência:** `ACIDENTE` e `OUTRO` existem no banco, mas ainda não têm classe nem regra de cobrança.

## O que já roda nas rotas e o que é modelo ainda não ligado

Nem toda classe tem uma rota que a use hoje. Isto é o estado real, para ninguém supor que a regra de uma
classe é a que está rodando quando ela ainda não está:

| Já usado pelo código que roda | Onde |
|---|---|
| `Usuario`, `criarUsuario` e `autenticar()` | O login (`POST /api/auth/login`) cria o usuário pela fábrica e autentica por ele. |
| `Reserva` | Toda resposta das rotas de reservas passa por `Reserva.paraDto()` e `paraDtoDetalhado()` (inclui a regra do `expiraEm`), e o cancelamento chama `Reserva.cancelar()`. |
| `ReservaService` | É o que as quatro rotas de reservas chamam. |
| `TipoBicicleta` | O catálogo público monta cada tipo por `TipoBicicleta` e devolve `paraPublico()`. |
| `RecomendacaoService` e os critérios | `GET /api/recomendacao`. |
| `Pagamento`, `PagamentoPix`, `CodigoPix`, `PagamentoService`, `PagarReservaService`, `GatewayStripe` | As rotas 16 a 18 (Pix pela Stripe). `GatewayStripe` implementa a interface `GatewayPix`, que é tudo o que os casos de uso conhecem. |
| `Dinheiro`, `Periodo` | Dentro de `Reserva` e `TipoBicicleta`. |
| `OperacaoService`, `Movimentacao`, `Checklist`, `ItemDoChecklist` | As rotas 26 e 27 (retirada e devolução). O serviço coordena `Reserva` (`iniciar()`/`concluir()`), `Bicicleta` (`estaDisponivel()`) e `Movimentacao`. |

| Modelo de domínio com testes, ainda sem rota | O que falta para ligar |
|---|---|
| `PagamentoCartao` | A rota de pagamento com cartão (o MVP só tem Pix). |
| `Ocorrencia` (`Dano`, `Atraso`, `Furto`), `Arquivo` | A tabela `ocorrencia` e o armazenamento de arquivos (fase 5 do plano). A devolução com atraso ainda não abre `Atraso`. |
| `Notificacao`, `RoteadorDeEnvio` | Os canais de envio reais (fase de avisos). |
| `AuditoriaLog` | A gravação da trilha pelo servidor. |
| `Empresa`, `Ponto`, `Bicicleta` | Os repositórios que leem do banco para objeto e as rotas que os usam. |
| Métodos de `Reserva` além de `paraDto` e `cancelar` (`confirmar`, `iniciar`, `concluir`, `expirar`...) e de `Cliente` (perfil e termos) | Os casos de uso de pagamento, operação e conta, que ainda trabalham sobre o banco. |

### Cancelar reserva: a regra é da classe

`POST /api/reservas/{id}/cancelar` trava a reserva no banco (`FOR UPDATE`), lê a linha inteira, monta a
`Reserva` e chama `reserva.cancelar(...)`. Quem decide se pode cancelar é a classe, pela tabela
`TRANSICOES`; se não pode, ela lança `TransicaoDeReservaInvalida` (409, com a mensagem do contrato) e o caso
de uso só grava o que ela aprovou. A ordem trava, depois lê, é o que impede dois cancelamentos simultâneos de
passarem juntos pela regra; um teste com conexões reais confere isso (um responde 200, o outro 409).

## Como os testes provam que nada quebrou

- `scripts/teste-de-estresse.mjs` ataca a API rodando (concorrência, força bruta, tokens forjados,
  entradas maliciosas) e confere as regras das classes sob carga: duas reservas na mesma bicicleta,
  dois Pix na mesma reserva e um cliente mexendo na reserva de outro nunca passam.

- Testes unitários ao lado do código (`*.test.ts`), um grupo para cada classe e cada serviço. Rodam na CI.
- Os testes de comportamento que já existiam (rotas, casos de uso, banco) continuam passando: a refatoração
  não muda o JSON das respostas, as rotas nem as migrations.
- Os testes de banco (`db/tests`) conferem o cancelamento de reserva em conexões reais, inclusive a corrida
  de dois cancelamentos ao mesmo tempo.

## As telas (front-end)

A regra vale também para o que roda no navegador: a lógica das telas mora em classes, e o componente
React só desenha. Os componentes são funções porque o React pede isso; eles não decidem nada, só
perguntam aos objetos.

O exemplo é `src/shared/empresa`, que lê `GET /api/empresa`:

- **Encapsulamento.** `EmpresaDaLocadora`, `PontoDeRetirada`, `GradeDeHorarios` e `HorarioDoDia` têm campos
  privados (`#`), só existem válidos (o construtor lança `RangeError`) e devolvem cópia. O JSON sai por
  `paraDto()` e `toJSON()`, e só com os campos do contrato.
- **Resposta da rede sem confiança.** `LeitorDeObjeto` embrulha o valor desconhecido e só deixa ler campo
  próprio, já no tipo certo; cada classe tem um `static deResposta(...)` que devolve `null` quando o
  dado não serve. Ponto ou horário inválido é descartado sozinho.
- **Herança e polimorfismo.** `ResultadoDaEmpresa` é abstrata e tem três filhas: `EmpresaCarregada`,
  `EmpresaSemCadastro` e `EmpresaIndisponivel`. Todas respondem a `pontoPrincipal()` e
  `opcoesDePonto(...)`, então a tela pergunta ao objeto em vez de repetir um `if` por situação. Só a
  escolha do que desenhar usa `instanceof`.
- **Injeção de dependência.** `BuscadorDeEmpresa` recebe o `fetch` e o tempo limite no construtor; nos
  testes entra um `fetch` de mentira.

Essas classes não reaproveitam `Empresa` e `Ponto` do módulo `catalogo` de propósito: aquelas ficam do
lado do servidor (junto do `pg`), e o navegador não pode importá-las. Estas modelam a resposta pública
da API do lado do cliente.

### A infraestrutura compartilhada (`src/shared`)

Tudo o que as rotas e as telas usam de comum também é objeto, e o que muda de ambiente entra pelo
construtor (injeção de dependência):

- `BancoDeDados` recebe a fábrica do pool; `LimiteDeTentativas` e `VerificadorDoBanco` recebem o banco
  (`ExecutorDeConsultas`, uma interface com um método só). Nos testes entra um banco de mentira.
- `ClienteApi` recebe o `fetch`, o `ArmazemDeSessao`, o `TradutorDeErros` e o que fazer num 401;
  `ArmazemDeSessao` recebe a janela do navegador. Os testes não trocam nenhum global.
- `PerfisPermitidos` guarda a lista de perfis de cada rota e devolve a sessão com o perfil já
  estreitado; `LeitorDeCorpo` guarda o limite de bytes.
- `Cpf` e `Cnpj` só existem válidos (`de()` devolve `null` se não forem), e o algoritmo do CPF mora
  num lugar só, usado pelo navegador e pela API.
- `Resposta` e `Dinheiro.ZERO` são fábricas e constantes da própria classe; `Resposta` lança se alguém
  tentar criar uma instância.

### O que ainda não foi convertido

Estes grupos ainda têm funções soltas e entram nas próximas fases: as regras compartilhadas do domínio
(`preco-aluguel.ts`, `periodo.ts` e `ciclista.ts`, que estão ligadas a `reservas`, `operacao` e
`catalogo`), os módulos `contas`, `catalogo`, `recomendacao`, `reservas`, `pagamentos` e `operacao`
(casos de uso, repositórios e handlers), a lógica das telas em `src/shared/*` (busca, agenda, início,
perfil, conta, operação, admin, markdown e landing) e as rotas `route.ts`, que passam a só chamar classes.
