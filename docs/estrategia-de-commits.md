# Estratégia de commits e fluxo de trabalho

Combinado da equipe para escrever commits, criar branches, abrir pull requests e revisar, de modo que
todo mundo trabalhe do mesmo jeito. É uma proposta baseada no que o time já faz, e pode ser ajustada
em conjunto.

## Em uma frase

Cada tarefa vira uma **branch curta** criada a partir da `dev`, com **commits pequenos e bem
descritos**, que chega à `dev` por um **pull request revisado e com a CI verde**.

## As branches

```
feat/ fix/ docs/ chore/ test/   --PR-->   dev   --decisão da equipe-->   main
 (uma por tarefa, curta)               (integração)                    (estável)
```

| Branch | Para que serve | Quem mexe |
|---|---|---|
| `main` | Versão estável. Só recebe da `dev` quando a equipe decide | Só por pull request, por decisão da equipe |
| `dev` | Integração: reúne o trabalho já revisado | Só por pull request |
| `tipo/assunto` | Uma tarefa, de vida curta (dias, não semanas) | A pessoa que faz a tarefa |

**Ninguém faz push direto na `dev` nem na `main`.**

### Nome da branch

`tipo/assunto-curto-em-minusculas`, com hifens e sem acentos. Os tipos são os mesmos dos commits:

| Exemplo | Quando |
|---|---|
| `feat/cadastro-de-bicicleta` | Funcionalidade nova |
| `fix/limite-de-tentativas` | Correção de defeito |
| `docs/estrategia-de-commits` | Só documentação |
| `chore/atualiza-dependencias` | Ajuste que não muda o comportamento (configuração, dependências) |
| `test/cobre-reservas` | Só testes |

## Mensagens de commit

Formato:

```
tipo(escopo): resumo curto, no presente e em português

Corpo opcional, mas recomendado: explica o porquê da mudança e o que ainda
será feito. O resumo diz o quê; o corpo diz por quê.
```

- **Resumo:** até cerca de 70 caracteres, sem ponto final, no presente ("adiciona", "corrige").
- **Escopo (opcional):** a parte do sistema que mudou. Normalmente é um módulo (`contas`,
  `reservas`, `pagamentos`) ou uma área (`db`, `http`, `ci`).
- **Corpo:** use quando a mudança não é óbvia, quando mexe no banco ou quando há uma decisão que
  alguém vai querer entender depois.
- **Um assunto por commit.** Se você precisa escrever "e" no resumo, provavelmente são dois commits.
- **Sem linha de coautoria** (`Co-Authored-By`).

### Tipos

| Tipo | Quando usar | Exemplo |
|---|---|---|
| `feat` | Funcionalidade nova | `feat(contas): cadastro e login do cliente` |
| `fix` | Correção de defeito | `fix(db): catálogo público sem colunas sensíveis` |
| `docs` | Só documentação | `docs: muda o escopo para uma única locadora` |
| `chore` | Ajuste que não muda o comportamento | `chore: adiciona script test (node --test)` |
| `test` | Só testes | `test(contas): cobre o limite de tentativas` |
| `refactor` | Reorganiza o código sem mudar o comportamento | `refactor(reservas): separa a regra de preço` |

## Passo a passo de uma tarefa

1. **Atualize a base.**
   ```bash
   git checkout dev
   git pull
   ```
2. **Crie a branch.**
   ```bash
   git checkout -b feat/cadastro-de-bicicleta
   ```
3. **Trabalhe em commits pequenos**, com mensagens no padrão acima.
4. **Confira antes de enviar.** O que a CI vai rodar, rode antes na sua máquina:
   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```
   Se mexeu no banco: `cd db && npm run migrar:simular`.
5. **Traga a `dev` para a sua branch** e resolva conflitos aí, localmente:
   ```bash
   git fetch origin
   git merge origin/dev
   ```
6. **Envie a branch.**
   ```bash
   git push -u origin feat/cadastro-de-bicicleta
   ```
7. **Abra o pull request** (veja o modelo abaixo).
8. **Responda à revisão** com novos commits na mesma branch.
9. **Mescle e limpe.** Com a revisão aprovada e a CI verde, faça o merge (o padrão do time é
   "Merge pull request") e apague a branch.

## Pull request

### Base certa

**A base do PR é `dev`.** O GitHub sugere `main` por padrão: confira o campo `base` antes de criar. O
sinal de que errou é um PR com muitos arquivos e commits que não são seus.

### Título e descrição

O título é a mensagem do commit principal. A descrição segue este modelo:

```markdown
## O que este PR faz
O que mudou, em poucas linhas.

## Por que
O problema ou o requisito que isso resolve.

## Como testar
Passo a passo para quem revisa conferir.

## Atenção
Migrations novas, variáveis de ambiente novas, pendências e riscos.

## Uso de IA
Se usou um assistente de IA, diga onde ajudou e qual foi a sua parte.
```

### Tamanho

Um assunto por PR e, de preferência, pequeno (algumas centenas de linhas no máximo). PR pequeno é
revisado rápido e tem menos risco.

## Revisão

| Papel | O que faz |
|---|---|
| **Quem escreveu** | Abre o PR com a descrição completa, confere a CI e responde aos comentários |
| **Quem revisa** | É outra pessoa, que não escreveu o PR. Aprova (Approve) ou pede mudanças (Request changes) |
| **William (DevOps e QA)** | Cuida da CI e valida o backend a cada marco. Avisa se um PR deixar o pipeline vermelho |
| **Luis (tech lead)** | Decide quando a `dev` vai para a `main`, cuida das migrations e do banco e revisa mudanças de segurança |

**Para ser mesclado, o PR precisa de:** a CI verde e ao menos uma aprovação. A CI tem 5 checks, que
rodam em paralelo: `lint`, `typecheck`, `test`, `build` e `banco` (migrations e testes de banco). Se
um deles ficar vermelho, abra o job com esse nome para ver o log.

**Proteção da `dev` (ruleset "Proteger dev"):** hoje exige PR com 1 aprovação e bloqueia push direto,
force push e a exclusão da branch. Os 5 checks acima passam a ser exigidos depois do merge do PR da T14
(a ativação é feita pelo Hélio, dono do repositório). Quem renomear um job avisa o Hélio, porque o nome
do job é o nome do check exigido.

### Checklist de quem revisa

- [ ] A base é `dev` e o PR só tem commits e arquivos da tarefa.
- [ ] A CI está verde.
- [ ] Não há segredo no código (senhas, tokens, `.env`, strings de conexão).
- [ ] Nenhuma migration já aplicada foi editada.
- [ ] Os testes acompanham o código e a documentação foi atualizada, se mudou algo que ela descreve.
- [ ] As consultas ao banco usam parâmetros (`$1`), sem montar SQL com texto do usuário.
- [ ] Os módulos só são usados pelo `index.ts` (o lint já barra, mas vale olhar).

Use comentários por linha nos pontos específicos e um resumo geral ao concluir.

## Regras para todos

1. **Nunca commitar segredos.** `.env`, `.env.local`, senhas, tokens e chaves ficam fora do Git. O
   `.gitignore` cobre os arquivos conhecidos, mas confira o `git status` antes de commitar.
2. **Migration já aplicada nunca é editada.** Para mudar o banco, crie a próxima migration, com o
   número seguinte. O runner avisa se um arquivo mudou depois de aplicado.
3. **Nada de `git push --force` na `dev` e na `main`.** Na sua própria branch, se precisar, use só
   `--force-with-lease`.
4. **O `package-lock.json` deve ser gerado com o mesmo npm da CI** (npm 10, Node 22). Um lockfile
   gerado com outra versão já quebrou o `npm ci` na CI uma vez.
5. **Testes e documentação acompanham o código**, no mesmo PR.
6. **Não mexa no banco de produção** (branch `production` do Neon) fora do combinado com o tech lead.
7. **Não apague nem reescreva histórico** que já foi enviado e que outras pessoas podem ter baixado.

## Banco de dados e migrations

- Cada mudança do banco é um arquivo numerado em `db/migrations/` (`0004_descricao.sql`), com as
  seções `-- migrate:up` (aplica) e `-- migrate:down` (desfaz).
- Antes de aplicar, rode `npm run migrar:simular` (executa e desfaz, só para conferir).
- Cada migration roda dentro de uma transação: se algo falhar, nada fica pela metade.
- O runner usa a conexão direta (`DATABASE_URL_UNPOOLED`) e mostra o host antes de agir: confira se é
  o branch certo do Neon.
- Detalhes em [`db/README.md`](../db/README.md).

## Quando dá conflito

1. Traga a `dev` para a sua branch: `git fetch origin` e `git merge origin/dev`.
2. O Git marca os arquivos em conflito. Abra cada um, escolha o que fica e apague os marcadores
   (`<<<<<<<`, `=======` e `>>>>>>>`).
3. `git add` nos arquivos resolvidos e `git commit`.
4. Rode a checagem (lint, typecheck, testes) e envie com `git push`.

Se não tiver certeza do que manter, **pergunte a quem escreveu o outro lado** antes de decidir.

## Do `dev` para a `main`

A `main` só recebe da `dev` por decisão da equipe, em um marco combinado (por exemplo, o fim de uma
fase do plano). Quem abre esse PR é o tech lead, e ele precisa ter a CI verde e a revisão do time.

## Dúvidas comuns

| Pergunta | Resposta |
|---|---|
| Posso commitar direto na `dev`? | Não. Sempre por branch e pull request. |
| O GitHub abriu o PR para a `main`. E agora? | Edite o PR e troque a base para `dev`. |
| A CI ficou vermelha por causa de outra pessoa | Avise o William; não mescle até resolver. |
| Errei uma mensagem de commit que ainda não enviei | `git commit --amend` corrige o último commit. |
| Errei uma mensagem que já enviei | Deixe como está e faça um novo commit certo. Não reescreva o histórico. |
| Preciso de uma variável de ambiente nova | Acrescente no `.env.example` (sem o valor real) e avise no PR. |
