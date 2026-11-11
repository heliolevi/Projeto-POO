# Contrato da API do MVP

Este documento é o combinado entre quem **implementa** as rotas (back-end) e quem **consome** (telas).
Cada rota tem o que precisa para ser feita e usada sem perguntar: método, caminho, quem pode chamar,
corpo, resposta de sucesso e erros. Se algo precisar mudar, avise na PR ou no grupo antes de mudar o
código: o contrato só muda com os dois lados de acordo.

> **Estado:** rotas marcadas como *existe* já estão no código; as marcadas como *novo* serão feitas na
> semana do MVP. Quem faz cada uma está na tabela do [resumo](#resumo-das-rotas).

## Convenções

**Sucesso:** `{ "data": ... }`, com o status da tabela de cada rota. Respostas `204` não têm corpo.

**Erro:** `{ "error": { "code": "...", "message": "...", "details": { "campo": "mensagem" } } }`.
`details` só aparece em erro de validação (`400`), com uma mensagem por campo.

| Status | `code` | Quando |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Corpo ou parâmetro inválido (JSON quebrado, campo fora da regra) |
| 401 | `UNAUTHORIZED` | Sem token, token inválido ou expirado, ou conta inativa |
| 403 | `FORBIDDEN` | Logado, mas o perfil não pode chamar a rota |
| 404 | `NOT_FOUND` | Recurso não existe **ou não é seu** (não se diz qual dos dois) |
| 409 | `CONFLICT` | O estado atual não permite a ação (sem bicicleta livre, reserva já paga, etc.) |
| 413 | `PAYLOAD_TOO_LARGE` | Corpo acima de 16 KiB |
| 429 | `TOO_MANY_REQUESTS` | Limite de tentativas; vem o cabeçalho `Retry-After` (segundos) |
| 502 | `PAGAMENTO_INDISPONIVEL` | O Mercado Pago não respondeu ou recusou a criação da cobrança *(código novo)* |
| 500 | `INTERNAL_ERROR` | Erro inesperado; a mensagem é sempre genérica |

**Autenticação:** `Authorization: Bearer <token>`, com o token devolvido pelo login ou cadastro (vale 24 h).
Em cada rota, "Quem" diz o perfil exigido: `Visitante` (sem login), `CLIENTE`, `OPERADOR`, `ADMIN`.
O servidor confere sempre se a conta ainda está ativa.

**Perfis:** `CLIENTE`, `OPERADOR` e `ADMIN` (o modelo antigo, com gerente e administrador da plataforma,
deixou de existir).

**Valores:**

- **Dinheiro:** sempre em **centavos inteiros** (`precoDiaCentavos: 5000` é R$ 50,00). Nunca decimal.
- **Datas e horas:** texto ISO 8601. A tela envia com o fuso de São Luís (`2026-11-14T09:00:00-03:00`);
  a API devolve em UTC (`2026-11-14T12:00:00.000Z`).
- **Identificadores:** UUID em texto.
- **Enumerações:** em maiúsculas, iguais às do banco.

| Enumeração | Valores |
|---|---|
| `experiencia` | `INICIANTE`, `INTERMEDIARIO`, `AVANCADO` |
| `atividade` | `PASSEIO`, `URBANO`, `TRILHA`, `ESPORTE`, `TURISMO` |
| `status` da reserva | `PENDENTE_PAGAMENTO`, `CONFIRMADA`, `EM_ANDAMENTO`, `CONCLUIDA`, `CANCELADA`, `EXPIRADA` |
| `status` do pagamento | `PENDENTE`, `APROVADO`, `RECUSADO`, `EXPIRADO` |
| `status` da bicicleta | `DISPONIVEL`, `MANUTENCAO`, `BLOQUEADA`, `BAIXADA` |

> `ALUGADA` existe no banco, mas **no MVP não é usada**: a disponibilidade vem das reservas, e o
> `status` da bicicleta só marca manutenção ou bloqueio.

**Decisão do MVP:** o cliente reserva um **tipo** de bicicleta, e o sistema escolhe a **unidade** livre
dentro da transação. A tela nunca escolhe uma bicicleta específica.

### Reserva: estados e transições

```
PENDENTE_PAGAMENTO --(pagamento aprovado)--> CONFIRMADA --(retirada)--> EM_ANDAMENTO --(devolução)--> CONCLUIDA
        |                                        |
        |--(15 min sem pagar)--> EXPIRADA        |--(cancelar antes da retirada)--> CANCELADA
        |--(cancelar)--> CANCELADA
```

Uma reserva `PENDENTE_PAGAMENTO` segura a bicicleta por **15 minutos** (`expiraEm`). Passado o prazo,
ela vira `EXPIRADA` e a bicicleta volta a ficar livre.

### Objeto `reserva` (devolvido pelas rotas de reserva)

```json
{
  "id": "uuid",
  "codigo": "BIC-7K2F9Q",
  "status": "PENDENTE_PAGAMENTO",
  "tipo": { "id": "uuid", "nome": "Urbana" },
  "ponto": { "id": "uuid", "nome": "Ponto Litorânea", "endereco": "Av. Litorânea, 100, Calhau" },
  "periodo": { "inicio": "2026-11-14T12:00:00.000Z", "fim": "2026-11-14T16:00:00.000Z" },
  "valorAluguelCentavos": 4000,
  "valorCaucaoCentavos": 15000,
  "expiraEm": "2026-11-14T11:15:00.000Z",
  "criadaEm": "2026-11-14T11:00:00.000Z"
}
```

`expiraEm` só vem preenchido enquanto a reserva está `PENDENTE_PAGAMENTO`; nos outros estados é `null`.
O número da bicicleta (`codigo` da unidade) só aparece para a equipe, nas rotas de operação.

---

## Resumo das rotas

| # | Rota | Quem | Estado | Implementa | Consome |
|---|---|---|---|---|---|
| 1 | `POST /api/auth/cadastro` | Visitante | existe | Hélio | Renan |
| 2 | `POST /api/auth/login` | Visitante | existe | Hélio | Renan |
| 3 | `GET /api/conta/me` | Logado | existe | Hélio | Renan |
| 4 | `PUT /api/conta/perfil-ciclista` | CLIENTE | existe | Hélio | Renan |
| 5 | `POST /api/conta/senha` | Logado | existe (PR do Renan) | Renan | Luis |
| 6 | `POST /api/conta/altura` | CLIENTE | existe (PR do Renan) | Renan | Luis |
| 7 | `POST /api/conta/termos` | CLIENTE | existe (PR do Renan) | Renan | Luis |
| 8 | `POST /api/conta/desativar` | Logado | existe (PR do Renan) | Renan | Luis |
| 9 | `GET /api/empresa` | Visitante | novo | Hélio | Renan |
| 10 | `GET /api/catalogo/tipos` | Visitante | novo | Hélio | Renan |
| 11 | `GET /api/recomendacao` | CLIENTE | novo | Hélio | Renan |
| 12 | `POST /api/reservas` | CLIENTE | novo | Luis | Renan |
| 13 | `GET /api/reservas` | CLIENTE | novo | Luis | Renan |
| 14 | `GET /api/reservas/{id}` | CLIENTE | novo | Luis | Renan |
| 15 | `POST /api/reservas/{id}/cancelar` | CLIENTE | novo | Luis | Renan |
| 16 | `POST /api/pagamentos` | CLIENTE | novo | Hélio | Renan |
| 17 | `GET /api/pagamentos/{reservaId}/status` | CLIENTE | novo | Hélio | Renan |
| 18 | `POST /api/pagamentos/webhook` | Mercado Pago | novo | Hélio | Mercado Pago |
| 19 | `GET /api/admin/tipos` | ADMIN | novo | Hélio | Hélio |
| 20 | `POST /api/admin/tipos` | ADMIN | novo | Hélio | Hélio |
| 21 | `PUT /api/admin/tipos/{id}` | ADMIN | novo | Hélio | Hélio |
| 22 | `GET /api/admin/bicicletas` | ADMIN | novo | Hélio | Hélio |
| 23 | `POST /api/admin/bicicletas` | ADMIN | novo | Hélio | Hélio |
| 24 | `PATCH /api/admin/bicicletas/{id}` | ADMIN | novo | Hélio | Hélio |
| 25 | `GET /api/admin/reservas` | OPERADOR, ADMIN | novo | Hélio | Luis |
| 26 | `POST /api/operacao/reservas/{id}/retirada` | OPERADOR, ADMIN | novo | Hélio | Luis |
| 27 | `POST /api/operacao/reservas/{id}/devolucao` | OPERADOR, ADMIN | novo | Hélio | Luis |

---

## Contas

### 1. `POST /api/auth/cadastro`

Cria a conta de um cliente e já devolve a sessão. **Existe.**

| | |
|---|---|
| **Quem** | Visitante |
| **Limite** | por IP (ver `limite_tentativas`); excedeu: `429` |

**Corpo:**

```json
{
  "nome": "Maria da Silva",
  "email": "maria@exemplo.com",
  "senha": "senha-forte-123",
  "cpf": "529.982.247-25",
  "aceiteTermos": true,
  "telefone": "(98) 99999-0000",
  "dataNascimento": "1990-05-20",
  "alturaCm": 172
}
```

Obrigatórios: `nome` (3 a 120), `email`, `senha` (8 a 128, com letra e número), `cpf` (válido, com ou sem
máscara) e `aceiteTermos` (precisa ser o booleano `true`). Opcionais: `telefone`, `dataNascimento`
(`AAAA-MM-DD`) e `alturaCm` (inteiro de 100 a 250).

**Sucesso `201`:**

```json
{ "data": { "token": "...", "tipo": "Bearer", "expiraEm": "2026-11-15T12:00:00.000Z",
            "usuario": { "id": "uuid", "perfil": "CLIENTE", "nome": "Maria da Silva", "email": "maria@exemplo.com" } } }
```

**Erros:** `400` (com `details` por campo), `409` (e-mail ou CPF já cadastrado), `413`, `429`.

### 2. `POST /api/auth/login`

| | |
|---|---|
| **Quem** | Visitante |
| **Limite** | 10 por e-mail+IP, 30 por IP e 100 por e-mail em 15 minutos; excedeu: `429` |

**Corpo:** `{ "email": "maria@exemplo.com", "senha": "senha-forte-123" }`

**Sucesso `200`:** o mesmo formato do cadastro (`token`, `tipo`, `expiraEm`, `usuario`).

**Erros:** `400`, `401` (a mensagem é a mesma para e-mail inexistente, senha errada e conta inativa),
`413`, `429`.

### 3. `GET /api/conta/me`

Dados da conta logada e, para cliente, os dados usados na recomendação. **Existe.**

| | |
|---|---|
| **Quem** | CLIENTE, OPERADOR, ADMIN |
| **Corpo** | nenhum |

**Sucesso `200`:**

```json
{ "data": { "id": "uuid", "perfil": "CLIENTE", "nome": "Maria da Silva", "email": "maria@exemplo.com",
            "ciclista": { "alturaCm": 172, "experiencia": "INICIANTE", "atividade": "PASSEIO" } } }
```

`ciclista` só vem para `CLIENTE`; campos não preenchidos vêm `null`.

**Erros:** `401`.

### 4. `PUT /api/conta/perfil-ciclista`

Grava os dados da recomendação. Substitui os três campos de uma vez. **Existe.**

| | |
|---|---|
| **Quem** | CLIENTE |
| **Alvo** | sempre a conta do token (um `id` no corpo é ignorado) |

**Corpo:**

```json
{ "alturaCm": 172, "experiencia": "INICIANTE", "atividade": "PASSEIO" }
```

Cada campo pode ser `null` (ou ausente) para apagar o dado. `alturaCm`: inteiro de 100 a 250.

**Sucesso `200`:** `{ "data": { "alturaCm": 172, "experiencia": "INICIANTE", "atividade": "PASSEIO" } }`

**Erros:** `400` (`details`: `alturaCm`, `experiencia` ou `atividade`), `401`, `403` (não é cliente), `413`.

### 5. `POST /api/conta/senha`

| | |
|---|---|
| **Quem** | CLIENTE, OPERADOR, ADMIN |
| **Limite** | tentativas de senha atual errada, por usuário (pedido da review do PR); excedeu: `429` |

**Corpo:** `{ "senhaAtual": "...", "novaSenha": "..." }` (nova: 8 a 128, com letra e número).

**Sucesso `204`.** **Erros:** `400`, `401` (token inválido **ou** senha atual incorreta), `413`, `429`.

### 6. `POST /api/conta/altura`

**Corpo:** `{ "alturaCm": 172 }` (inteiro de 100 a 250). **Quem:** CLIENTE.
**Sucesso `204`.** **Erros:** `400` (`details.alturaCm`), `401`, `413`.

> **Qual rota de altura usar.** As rotas 4 e 6 gravam a mesma coluna (`altura_cm`). A **oficial para a
> tela do perfil de ciclista é a rota 4** (`PUT /api/conta/perfil-ciclista`), que grava altura, experiência
> e atividade juntas. Esta rota 6 só altera a altura isolada e fica para a tela "Minha conta". Quem
> grava o perfil inteiro não precisa chamar a rota 6 antes nem depois.

### 7. `POST /api/conta/termos`

Registra o aceite da versão vigente dos termos de uso.

**Corpo:** `{ "versao": "2026-11" }`. **Quem:** CLIENTE.
**Sucesso `204`.** **Erros:** `400` (versão vazia, grande demais ou diferente da vigente), `401`, `413`.

### 8. `POST /api/conta/desativar`

Marca a conta como inativa (não apaga). O token anterior passa a ser recusado na hora.

**Corpo:** `{}`. **Quem:** CLIENTE, OPERADOR, ADMIN.
**Sucesso `204`.** **Erros:** `401`.

---

## Informações públicas e catálogo

### 9. `GET /api/empresa`

Dados públicos da locadora e do ponto de retirada, para a página inicial, o resumo da reserva e a tela
de sucesso. **Novo.**

| | |
|---|---|
| **Quem** | Visitante |
| **Corpo** | nenhum |

**Sucesso `200`:**

```json
{ "data": {
    "nomeFantasia": "Bike Ilha Club", "telefone": "(98) 90000-0000", "email": "contato@exemplo.com",
    "pontos": [ { "id": "uuid", "nome": "Ponto Litorânea", "logradouro": "Av. Litorânea", "numero": "100",
                  "complemento": null, "bairro": "Calhau", "cep": "65071380", "cidade": "São Luís", "uf": "MA",
                  "telefone": "(98) 90000-0000",
                  "horarios": [ { "diaSemana": 1, "abre": "08:00", "fecha": "18:00" } ] } ] } }
```

Só pontos ativos. **Nunca** devolve CNPJ, razão social, conta de recebimento nem campos de controle.

**Erros:** nenhum esperado além de `500`.

### 10. `GET /api/catalogo/tipos`

Lista dos tipos de bicicleta ativos. **Novo.**

| | |
|---|---|
| **Quem** | Visitante |

**Sucesso `200`:**

```json
{ "data": [ { "id": "uuid", "nome": "Urbana", "descricao": "Para o dia a dia na cidade",
              "atividades": ["URBANO", "PASSEIO"], "alturaMinCm": 150, "alturaMaxCm": 195,
              "nivelRecomendado": "INICIANTE", "precoHoraCentavos": 1000, "precoDiaCentavos": 5000,
              "valorCaucaoCentavos": 15000 } ] }
```

**Erros:** nenhum esperado além de `500`.

---

## Recomendação

### 11. `GET /api/recomendacao`

Os tipos com unidade livre no período, ordenados pela adequação ao cliente. **Novo.**

| | |
|---|---|
| **Quem** | CLIENTE |
| **Limite** | 60 por minuto por IP |

**Parâmetros (query):**

| Nome | Obrigatório | Regra |
|---|---|---|
| `inicio` | sim | ISO 8601; não pode estar no passado |
| `fim` | sim | maior que `inicio`; período de 1 hora a 7 dias |
| `atividade` | não | um valor de `atividade`; se ausente, vale a atividade do perfil do cliente |

**Sucesso `200`:**

```json
{ "data": {
    "periodo": { "inicio": "2026-11-14T12:00:00.000Z", "fim": "2026-11-14T16:00:00.000Z", "horas": 4 },
    "resultados": [
      { "tipoId": "uuid", "nome": "Passeio", "descricao": "Confortável para orla e passeio",
        "pontos": 90,
        "motivos": ["Cabe bem na sua altura de 172 cm", "Boa para passeio", "Adequada ao seu nível (iniciante)"],
        "valorAluguelCentavos": 4800, "valorCaucaoCentavos": 15000, "unidadesLivres": 3 } ] } }
```

Ordem: mais `pontos` primeiro; empate pelo menor preço por dia. Só entram tipos ativos, com ao menos uma
unidade livre (sem reserva ativa sobreposta) e que servem na altura do cliente (se ele não informou a
altura, nenhum tipo sai por altura). `pontos` vai de 0 a 100 (altura 50, atividade 30, experiência 20).
Lista vazia (`resultados: []`) **não é erro**: significa que nenhuma bicicleta está livre no período.

**Erros:** `400` (`details`: `inicio`, `fim`, `atividade`), `401`, `403` (não é cliente), `429`.

---

## Reservas

### 12. `POST /api/reservas`

Cria a reserva de um tipo para um período. O sistema escolhe a unidade livre. **Novo.**

| | |
|---|---|
| **Quem** | CLIENTE |
| **Limite** | 20 por hora por usuário |

**Corpo:**

```json
{ "tipoId": "uuid", "inicio": "2026-11-14T09:00:00-03:00", "fim": "2026-11-14T13:00:00-03:00" }
```

Mesmas regras de período da rota 11. O valor é calculado **no servidor**, pela mesma regra de preço da
recomendação (o cliente nunca envia valor).

**Sucesso `201`:** `{ "data": <objeto reserva> }`, com `status: "PENDENTE_PAGAMENTO"` e `expiraEm`.

**Erros:** `400`, `401`, `403`, `404` (tipo inexistente ou inativo), `409` (nenhuma unidade livre nesse
período: a tela deve oferecer outro horário), `429`.

### 13. `GET /api/reservas`

As reservas do cliente logado, da mais recente para a mais antiga. **Novo.**

| | |
|---|---|
| **Quem** | CLIENTE |
| **Query** | `status` (opcional, um valor da enumeração) |

Antes de listar, o servidor marca como `EXPIRADA` as pendentes vencidas.

**Sucesso `200`:** `{ "data": [ <objeto reserva>, ... ] }`

**Erros:** `400` (status inválido), `401`, `403`.

### 14. `GET /api/reservas/{id}`

| | |
|---|---|
| **Quem** | CLIENTE (só as próprias) |

**Sucesso `200`:** `{ "data": { ...<objeto reserva>, "pagamento": { "status": "PENDENTE", "metodo": "PIX" } | null } }`

**Erros:** `401`, `403`, `404` (não existe **ou é de outro cliente**).

### 15. `POST /api/reservas/{id}/cancelar`

Cancela uma reserva `PENDENTE_PAGAMENTO` ou `CONFIRMADA` que ainda não foi retirada. **Novo.**

| | |
|---|---|
| **Quem** | CLIENTE (só as próprias) |
| **Corpo** | `{}` |

**Sucesso `200`:** `{ "data": <objeto reserva> }` com `status: "CANCELADA"`; a bicicleta volta a ficar livre.

**Erros:** `401`, `403`, `404`, `409` (já retirada, concluída, cancelada ou expirada).

> Estorno de pagamento já aprovado **não faz parte do MVP**: o cancelamento de reserva paga é tratado
> no balcão.

---

## Pagamentos

### 16. `POST /api/pagamentos`

Cria a cobrança Pix de uma reserva. **Novo.** Cobra **só o aluguel**; a caução é combinada no balcão.

| | |
|---|---|
| **Quem** | CLIENTE (dono da reserva) |
| **Limite** | 10 por hora por usuário |

**Corpo:** `{ "reservaId": "uuid", "metodo": "PIX" }` (no MVP só `PIX`).

Idempotente: se a reserva já tem um Pix `PENDENTE` ainda válido, devolve o mesmo, sem criar outro.

**Sucesso `201`** (ou `200` se reaproveitou o Pix existente):

```json
{ "data": { "pagamentoId": "uuid", "reservaId": "uuid", "metodo": "PIX", "status": "PENDENTE",
            "valorCentavos": 4000,
            "pix": { "qrCodeBase64": "iVBORw0KGgo...", "copiaECola": "0002012658...", "expiraEm": "2026-11-14T11:15:00.000Z" } } }
```

Com `PAGAMENTO_MODO=simulado`, o QR é de mentira e existe uma forma de aprovar sem o Mercado Pago (só em
desenvolvimento e na demo).

**Erros:** `400`, `401`, `403`, `404` (reserva inexistente ou de outro cliente), `409` (reserva que não
está `PENDENTE_PAGAMENTO`, ou já paga), `429`, `502` (`PAGAMENTO_INDISPONIVEL`).

### 17. `GET /api/pagamentos/{reservaId}/status`

A tela chama a cada 3 segundos na tela do Pix, até a reserva ficar confirmada. **Novo.**

| | |
|---|---|
| **Quem** | CLIENTE (dono da reserva) |

**Sucesso `200`:** `{ "data": { "reservaId": "uuid", "statusPagamento": "APROVADO", "statusReserva": "CONFIRMADA" } }`

`statusPagamento` é `null` se a reserva ainda não tem cobrança.

**Erros:** `401`, `403`, `404`.

### 18. `POST /api/pagamentos/webhook`

Aviso do Mercado Pago. **Novo.** Não é chamada pela tela.

| | |
|---|---|
| **Quem** | Mercado Pago (sem token de usuário; a autenticação é a **assinatura** do aviso) |
| **Cabeçalhos** | `x-signature` e `x-request-id` (o servidor valida com `MP_WEBHOOK_SECRET`) |

**Corpo (do Mercado Pago):** `{ "type": "payment", "action": "payment.updated", "data": { "id": "123456789" } }`

O servidor **não confia no corpo**: com o `data.id`, consulta o pagamento na API do Mercado Pago. Se
estiver aprovado, na mesma transação marca o pagamento como `APROVADO` e a reserva como `CONFIRMADA`.
É **idempotente** (o mesmo aviso repetido não duplica nada, garantido pelo `mp_payment_id` único).

**Sucesso `200`:** `{ "data": { "recebido": true } }`. Também `200` para avisos de outros tipos ou de
pagamentos desconhecidos (ignorados), para o Mercado Pago não ficar reenviando.

**Erros:** `401` (assinatura ausente ou inválida), `413`.

---

## Painel da locadora

Todas as rotas desta seção exigem sessão e conferem o perfil no servidor.

### 19. `GET /api/admin/tipos`

Todos os tipos, inclusive inativos. **Quem:** ADMIN. **Sucesso `200`:** lista como a da rota 10, com
`"ativo": true|false` em cada item. **Erros:** `401`, `403`.

### 20. `POST /api/admin/tipos`

**Quem:** ADMIN.

**Corpo:**

```json
{ "nome": "Urbana", "descricao": "Para o dia a dia", "atividades": ["URBANO", "PASSEIO"],
  "alturaMinCm": 150, "alturaMaxCm": 195, "nivelRecomendado": "INICIANTE",
  "precoHoraCentavos": 1000, "precoDiaCentavos": 5000, "valorCaucaoCentavos": 15000, "ativo": true }
```

Regras: `nome` único; `atividades` com ao menos um valor; altura entre 100 e 250, com `alturaMinCm <=
alturaMaxCm`; preços e caução inteiros, maiores ou iguais a zero (centavos).

**Sucesso `201`:** o tipo criado. **Erros:** `400` (`details` por campo), `401`, `403`, `409` (nome repetido), `413`.

### 21. `PUT /api/admin/tipos/{id}`

Substitui os dados do tipo (mesmo corpo da rota 20). Para tirar um tipo do catálogo, envie `"ativo": false`
(não há exclusão). **Quem:** ADMIN. **Sucesso `200`:** o tipo atualizado.
**Erros:** `400`, `401`, `403`, `404`, `409`, `413`.

### 22. `GET /api/admin/bicicletas`

**Quem:** ADMIN. **Query (opcionais):** `tipoId`, `status`.

**Sucesso `200`:**

```json
{ "data": [ { "id": "uuid", "codigo": "BIC-001", "tipo": { "id": "uuid", "nome": "Urbana" },
              "ponto": { "id": "uuid", "nome": "Ponto Litorânea" }, "numeroSerie": "SN123",
              "tamanhoQuadro": "M", "status": "DISPONIVEL", "observacoes": null } ] }
```

**Erros:** `400`, `401`, `403`.

### 23. `POST /api/admin/bicicletas`

**Quem:** ADMIN.

**Corpo:** `{ "tipoId": "uuid", "pontoId": "uuid", "codigo": "BIC-015", "numeroSerie": "SN999", "tamanhoQuadro": "M", "observacoes": null }`

`codigo` é o número colado na bicicleta e é único. O `status` nasce `DISPONIVEL`.

**Sucesso `201`:** a bicicleta criada. **Erros:** `400`, `401`, `403`, `404` (tipo ou ponto inexistente), `409` (código repetido), `413`.

### 24. `PATCH /api/admin/bicicletas/{id}`

Muda o `status` (por exemplo `MANUTENCAO`) e/ou as `observacoes`.

**Quem:** ADMIN. **Corpo:** `{ "status": "MANUTENCAO", "observacoes": "pneu furado" }` (ao menos um campo).
**Sucesso `200`:** a bicicleta atualizada. **Erros:** `400`, `401`, `403`, `404`, `413`.

### 25. `GET /api/admin/reservas`

Reservas para o painel, com o nome do cliente e a unidade escolhida.

| | |
|---|---|
| **Quem** | OPERADOR, ADMIN |
| **Query (opcionais)** | `status`; `data` (`AAAA-MM-DD`, no fuso de São Luís: reservas que começam nesse dia) |

**Sucesso `200`:**

```json
{ "data": [ { "id": "uuid", "codigo": "BIC-7K2F9Q", "status": "CONFIRMADA",
              "cliente": { "id": "uuid", "nome": "Maria da Silva" },
              "tipo": { "id": "uuid", "nome": "Urbana" },
              "bicicleta": { "id": "uuid", "codigo": "BIC-003" },
              "periodo": { "inicio": "2026-11-14T12:00:00.000Z", "fim": "2026-11-14T16:00:00.000Z" },
              "valorAluguelCentavos": 4000 } ] }
```

**Erros:** `400`, `401`, `403`.

### 26. `POST /api/operacao/reservas/{id}/retirada`

Registra a retirada da bicicleta pelo cliente e passa a reserva para `EM_ANDAMENTO`.

| | |
|---|---|
| **Quem** | OPERADOR, ADMIN |
| **Regra** | só reserva `CONFIRMADA`, a partir de 30 minutos antes do início |

**Corpo:**

```json
{ "checklist": { "itens": [ { "nome": "freios", "ok": true }, { "nome": "pneus", "ok": true },
                            { "nome": "corrente", "ok": true }, { "nome": "capacete", "ok": true },
                            { "nome": "luzes", "ok": false } ],
                 "observacoes": "farol traseiro fraco" } }
```

**Sucesso `200`:** `{ "data": { ...<objeto reserva>, "bicicleta": { "id": "uuid", "codigo": "BIC-003" } } }` com `status: "EM_ANDAMENTO"`.

**Erros:** `400` (checklist inválido ou fora da janela de horário), `401`, `403`, `404`, `409` (reserva
não está `CONFIRMADA` ou a retirada já foi feita), `413`.

### 27. `POST /api/operacao/reservas/{id}/devolucao`

Registra a devolução e conclui a reserva.

| | |
|---|---|
| **Quem** | OPERADOR, ADMIN |
| **Regra** | só reserva `EM_ANDAMENTO` |

**Corpo:** o mesmo da retirada. **Sucesso `200`:** `{ "data": <reserva> }` com `status: "CONCLUIDA"`.
**Erros:** `400`, `401`, `403`, `404`, `409` (não está `EM_ANDAMENTO` ou a devolução já foi feita), `413`.

---

## Mudanças deste contrato

Qualquer mudança de rota, campo ou erro entra aqui, na mesma PR do código, e avisa quem implementa e
quem consome. Pontos ainda abertos para o Luis fechar com Hélio e Renan:

- Formato final de `horarios` do ponto (`diaSemana` de 0 a 6, começando no domingo?).
- Se o cliente sem altura preenchida pode buscar (assumido: pode; só perde o filtro e os pontos de altura).
- Texto exato das mensagens de erro de `409` que a tela mostra ao cliente.
