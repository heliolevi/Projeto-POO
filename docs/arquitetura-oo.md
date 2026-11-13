# Arquitetura orientada a objetos

Como o código do Bike Ilha Club segue o diagrama de classes (`docs/diagrama-de-classes.pdf`, páginas 3 e 4). A orientação a objetos é requisito da disciplina de POO e vale para todo o código de regra de negócio (`src/modules` e as classes de apoio em `src/shared`).

> **Estado em 12/11/2026.** O MVP entregue em 13/11 ainda tem boa parte do back-end em estilo funcional (tipos e fábricas `criarX(deps)`). A migração para classes acontece em um PR por módulo, entre 16 e 19/11. O plano e o cronograma estão em `docs/superpowers/plans/2026-11-12-refatoracao-poo.md` e em [andamento-do-projeto.md](andamento-do-projeto.md). A coluna "Situação" da tabela abaixo diz o que já é classe e o que ainda não é.

## Os quatro pilares no projeto

| Pilar | Onde aparece | Exemplo |
|---|---|---|
| **Abstração** | Interfaces ("portas") em `domain/portas.ts` de cada módulo | `RepositorioUsuarios`, `HasherSenha`, `GatewayPagamento` |
| **Encapsulamento** | Atributos privados (`#`) e métodos que mantêm as regras | `#senhaHash` e `#ativo` em `Usuario`; o estado da `Reserva` só muda por `confirmar()`, `cancelar()`, `iniciar()` e `concluir()` |
| **Herança** | Classes base abstratas e especializações | `Usuario` → `Cliente`, `Operador`, `Admin`; `Pagamento` → `PagamentoPix`, `PagamentoCartao`; `Movimentacao` → `Retirada`, `Devolucao`; `AppError` → `ValidationError`, `NotFoundError`, etc. |
| **Polimorfismo** | Quem recebe a base chama o método sem saber a subclasse | `usuario.podeOperarBalcao()` responde diferente por perfil; `EstadoReserva` decide a transição; `Notificacao` usa um `CanalNotificacao` (WhatsApp, e-mail ou push) |

## Classes do diagrama e onde vivem

| Classe do diagrama | Arquivo | Módulo | Situação |
|---|---|---|---|
| `Usuario` (abstrata), `Cliente`, `Operador`, `Admin` | `domain/usuario.ts` | contas | a migrar (R2) |
| `Empresa` (único registro) | `domain/empresa.ts` | administracao | novo (T55) |
| `TipoBicicleta`, `Bicicleta` | `domain/tipo-bicicleta.ts`, `domain/bicicleta.ts` | catalogo | a migrar (R4) |
| `Periodo`, `TabelaDePrecos` | `src/shared/dominio/periodo.ts`, `reservas/domain/tabela-de-precos.ts` | shared, reservas | a migrar (R1) |
| `Reserva` e estados | `domain/reserva.ts`, `domain/estado-reserva.ts` | reservas | a migrar junto do #45 (R3) |
| `ReservaService` | `application/reserva-service.ts` | reservas | a migrar (R3) |
| `RecomendacaoService` | `application/recomendacao-service.ts` | recomendacao | a migrar (R5) |
| `Pagamento`, `PagamentoPix`, `PagamentoCartao`, `PagamentoService` | `domain/pagamento.ts`, `application/pagamento-service.ts` | pagamentos | novo (T36, T37), com gateway simulado |
| `Movimentacao`, `Retirada`, `Devolucao`, `Ocorrencia` | `domain/movimentacao.ts`, `domain/ocorrencia.ts` | operacao | novo (T45) |
| `Notificacao`, `CanalNotificacao` | `domain/notificacao.ts` | notificacoes | novo, só domínio (R6) |
| `Arquivo` | n/a | n/a | fora do MVP; só no diagrama |

Cada classe de entidade corresponde a uma tabela. A correspondência está em [modelo-de-dados.md](modelo-de-dados.md#classes-do-domínio-e-tabelas).

## Regras de estilo

1. **Só sintaxe apagável pelo Node.** Os testes rodam com `node --test` direto no TypeScript. Por isso: nada de `constructor(private x: T)` (propriedade de parâmetro), `enum` ou `namespace`. Declare os atributos e use `#privado`. Uma regra do ESLint barra essas formas.
2. **Imports nos arquivos testados** usam caminho relativo com extensão (`"../domain/x.ts"`). O alias `@/` só vale em `infrastructure`, `http` e `src/app`.
3. **Entidade** é classe com atributos privados e métodos que mantêm as invariantes. **Objeto de valor** (`Periodo`, `Cpf`, `Dinheiro`) é imutável: atributos `readonly`, sem alterar depois de criado. **Serviço** é classe cujo construtor recebe só interfaces.
4. **Interfaces** ficam em `domain/portas.ts` do módulo; as implementações ficam em `infrastructure` (por exemplo `repositorio-usuarios-pg.ts`).
5. **Raiz de composição:** cada módulo tem `http/container.ts`, o único lugar que faz `new` de infraestrutura e entrega aos serviços. Os handlers só usam o que o container exporta.
6. **Transição inválida** lança `ConflictError` (409) e deixa o objeto como estava.
7. **Nomes** de classes, métodos e atributos seguem o diagrama, em português.
8. O `index.ts` de cada módulo continua sendo a única API pública (regra do ESLint que já existe).
9. **O comportamento externo não muda:** rotas, JSON, SQL e migrations ficam como estão. Os testes existentes continuam passando sem mudar as asserções; só muda a forma de construir (`new X(...)` no lugar de `criarX(...)`).

## Exemplo mínimo

```ts
// contas/domain/usuario.ts
export abstract class Usuario {
  readonly id: string;
  #ativo: boolean;
  constructor(dados: { id: string; ativo?: boolean }) {
    this.id = dados.id;
    this.#ativo = dados.ativo ?? true;
  }
  abstract get perfil(): PerfilUsuario;
  abstract podeOperarBalcao(): boolean;
  desativar(): void { this.#ativo = false; }
  get ativo(): boolean { return this.#ativo; }
}

export class Operador extends Usuario {
  get perfil(): PerfilUsuario { return "OPERADOR"; }
  podeOperarBalcao(): boolean { return true; }
}
```

`Admin` herda direto de `Usuario` (como no diagrama), não de `Operador`; ele implementa as suas próprias permissões.

## Como criar uma classe nova

1. Confira no diagrama o nome, os atributos e os métodos.
2. Escreva primeiro o teste da regra (por exemplo, a transição inválida lança `ConflictError`).
3. Crie a classe em `domain/` (entidade ou valor) ou `application/` (serviço). Se ela precisa de banco, relógio ou serviço externo, defina uma interface em `portas.ts` e receba pelo construtor.
4. Implemente a interface em `infrastructure` e ligue no `container.ts`.
5. Rode `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`.
6. Atualize a tabela de classes acima no mesmo PR.
