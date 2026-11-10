# Dados da locadora

Fonte única dos dados da locadora usados no seed (`db/seeds/dev.sql`), na tela de resumo da reserva, na home
e nos Termos de uso (T42). Este documento **descreve o que o seed já tem**; se os dois divergirem, vale o seed.

- **Origem dos dados:** todos `ASSUMIDO`. Não há locadora parceira no momento; o tech lead decidiu usar dados
  fictícios para entregar o MVP (decisão de 2026-11-10).
- **Data do levantamento:** 2026-11-10
- **Quem levantou:** William
- **Confirmado por:** Luis Felipe (tech lead), como valores assumidos
- **Conferido contra:** `db/seeds/dev.sql` na `dev` (commit a036697) e `docs/contrato-api-mvp.md`
- **Quando houver locadora real:** trocar os valores aqui, no seed e nos textos, e marcar a origem como `REAL`.

> Todos os nomes, telefones, e-mails, CNPJ e preços abaixo são **fictícios**. Dinheiro está em reais aqui e em
> centavos inteiros no banco (R$ 10,00 = 1000).

## 1. Empresa

| Campo | Valor | Origem |
|---|---|---|
| Razão social | Bike Ilha Club Locação de Bicicletas Ltda (exemplo) | ASSUMIDO |
| Nome fantasia | Bike Ilha Club | ASSUMIDO |
| CNPJ | 12.345.678/0001-95 (fictício) | ASSUMIDO |
| E-mail | contato@bikeilha.test | ASSUMIDO |
| Telefone / WhatsApp | (98) 90000-0000 | ASSUMIDO |
| Documentos exigidos na retirada | Documento de identidade com foto; CPF | ASSUMIDO |

## 2. Ponto de retirada

Há um único ponto, onde ficam todas as bicicletas.

| Campo | Valor | Origem |
|---|---|---|
| Nome | Ponto Litorânea | ASSUMIDO |
| Endereço | Avenida Litorânea, 100, Calhau, São Luís (MA), CEP 65000-000 | ASSUMIDO |
| Telefone | (98) 90000-0000 | ASSUMIDO |
| Localização (mapa) | latitude -2,4900; longitude -44,2200 | ASSUMIDO |

Horário de funcionamento:

| Dia | Abre | Fecha |
|---|---|---|
| Segunda a sexta | 08:00 | 18:00 |
| Sábado | 08:00 | 16:00 |
| Domingo | 08:00 | 14:00 |

## 3. Tipos de bicicleta

Seis tipos. As faixas de altura se sobrepõem de propósito, para a recomendação ter o que ordenar.

| Tipo | Altura (cm) | Atividades | Nível | Hora | Dia | Caução |
|---|---|---|---|---|---|---|
| Urbana | 150 a 195 | URBANO, PASSEIO | INICIANTE | R$ 10,00 | R$ 50,00 | R$ 150,00 |
| Passeio | 145 a 190 | PASSEIO, TURISMO | INICIANTE | R$ 12,00 | R$ 60,00 | R$ 150,00 |
| Mountain bike | 160 a 200 | TRILHA, ESPORTE | INTERMEDIARIO | R$ 20,00 | R$ 100,00 | R$ 300,00 |
| Speed | 165 a 200 | ESPORTE, URBANO | AVANCADO | R$ 25,00 | R$ 120,00 | R$ 400,00 |
| Elétrica | 150 a 200 | TURISMO, URBANO, PASSEIO | INICIANTE | R$ 35,00 | R$ 180,00 | R$ 600,00 |
| Infantil | 100 a 140 | PASSEIO | INICIANTE | R$ 8,00 | R$ 40,00 | R$ 100,00 |

Em centavos (como está no seed):

| Tipo | preco_hora_centavos | preco_dia_centavos | valor_caucao_centavos |
|---|---|---|---|
| Urbana | 1000 | 5000 | 15000 |
| Passeio | 1200 | 6000 | 15000 |
| Mountain bike | 2000 | 10000 | 30000 |
| Speed | 2500 | 12000 | 40000 |
| Elétrica | 3500 | 18000 | 60000 |
| Infantil | 800 | 4000 | 10000 |

## 4. Frota (14 bicicletas, todas no Ponto Litorânea)

| Tipo | Unidades | Códigos |
|---|---|---|
| Urbana | 3 | BIC-001 a BIC-003 |
| Passeio | 3 | BIC-004 a BIC-006 |
| Mountain bike | 3 | BIC-007 a BIC-009 |
| Speed | 2 | BIC-010 e BIC-011 |
| Elétrica | 2 | BIC-012 e BIC-013 |
| Infantil | 1 | BIC-014 |

Todas começam `DISPONIVEL`. Os tamanhos de quadro (P, M, G) e os números de série fictícios estão no seed.

## 5. Equipe de teste

| Perfil | E-mail |
|---|---|
| ADMIN | admin@bikeilha.test |
| OPERADOR | operador@bikeilha.test |

As senhas **não ficam no Git**: vêm de `SEED_ADMIN_SENHA` e `SEED_OPERADOR_SENHA` no `.env.local`.

## 6. Regras do aluguel

| Regra | Valor | Origem |
|---|---|---|
| Cancelamento | O cliente cancela pelo app enquanto a bicicleta não foi retirada (`POST /api/reservas/{id}/cancelar`) | Contrato |
| Estorno de reserva paga | Fora do MVP: o cancelamento de reserva já paga é tratado no balcão | Contrato |
| Prazo para cancelar sem custo | Até 24 horas antes do início (combinado no balcão; o app ainda não aplica esse prazo) | ASSUMIDO |
| Pagamento | Pix cobra só o aluguel; a reserva sem pagamento expira em 15 minutos | Contrato |
| Retirada | A partir de 30 minutos antes do início da reserva | Contrato |
| Atraso na devolução | Tolerância de 15 minutos; depois, cada hora extra pelo preço por hora do tipo | ASSUMIDO |
| Dano ou perda da bicicleta | O custo do conserto ou da reposição é descontado da caução e, se passar dela, cobrado do cliente | ASSUMIDO |
| Caução | Combinada e paga no balcão na retirada; devolvida na devolução sem problemas | ASSUMIDO |

## 7. Conferências com a recomendação

Exemplo do contrato e do plano de testes (CT-REC-06): cliente de 172 cm, iniciante, atividade passeio, 4 h.

| Tipo | Pontos | Aluguel de 4 h |
|---|---|---|
| Urbana | 98,9 | R$ 40,00 |
| Elétrica | 94,0 | R$ 140,00 |
| **Passeio** | **90,0** | **R$ 48,00** |
| Mountain bike | 30,0 | R$ 80,00 |
| Speed | 20,0 | R$ 100,00 |
| Infantil | fora (altura) | n/a |

O tipo Passeio fecha **90 pontos e R$ 48,00**, como o exemplo. Com esses dados, porém, a **Urbana** ganha do
Passeio para esse cliente, porque também indica `PASSEIO` e sua faixa é mais centrada em 172 cm. Quem
demonstrar o app deve esperar a Urbana em primeiro lugar.

## 8. Observações

- Os textos de Termos de uso e Política de privacidade (T42) devem citar as regras da seção 6.
- O prazo de 24 horas e as regras de atraso e dano são assumidos; confirmar com a locadora real, se houver.
