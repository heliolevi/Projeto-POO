// Dados mínimos usados pelas suítes unit/ e blackbox/: um ponto, um tipo e uma bicicleta de
// teste, e dois clientes (A e B). Tudo criado dentro da transação da suíte e desfeito no
// ROLLBACK final (db/tests/suporte.mjs) — não precisa de limpeza explícita.

export async function criarFixtures(client) {
  await client.query(`
    INSERT INTO empresa (razao_social, nome_fantasia, cnpj, email, telefone)
    VALUES ('Empresa de teste', 'Empresa de teste', '00000000000000', 'teste@bikeilha.test', '00000000000')
    ON CONFLICT (id) DO NOTHING
  `);

  const { rows: [ponto] } = await client.query(`
    INSERT INTO ponto (nome, logradouro, numero, bairro, cep, cidade, uf, ativo)
    VALUES ('Ponto teste-reserva', 'Rua Teste', '1', 'Centro', '65000000', 'São Luís', 'MA', true)
    RETURNING id
  `);

  const { rows: [tipo] } = await client.query(`
    INSERT INTO tipo_bicicleta
      (nome, atividades, altura_min_cm, altura_max_cm, preco_hora_centavos, preco_dia_centavos)
    VALUES ('Tipo teste-reserva', ARRAY['URBANO']::atividade[], 150, 190, 1000, 5000)
    RETURNING id
  `);

  const { rows: [bicicleta] } = await client.query(
    `INSERT INTO bicicleta (tipo_id, ponto_id, codigo) VALUES ($1, $2, 'BIC-TESTE-RESERVA') RETURNING id`,
    [tipo.id, ponto.id],
  );

  const { rows: [clienteA] } = await client.query(`
    INSERT INTO usuario (perfil, nome, email, senha_hash, cpf, aceite_termos_em, versao_termos)
    VALUES ('CLIENTE', 'Cliente A de teste', 'teste-reserva-a@bikeilha.test', 'hash', '11111111111', now(), 'v1')
    RETURNING id
  `);

  const { rows: [clienteB] } = await client.query(`
    INSERT INTO usuario (perfil, nome, email, senha_hash, cpf, aceite_termos_em, versao_termos)
    VALUES ('CLIENTE', 'Cliente B de teste', 'teste-reserva-b@bikeilha.test', 'hash', '22222222222', now(), 'v1')
    RETURNING id
  `);

  return {
    pontoId: ponto.id,
    tipoId: tipo.id,
    bicicletaId: bicicleta.id,
    clienteAId: clienteA.id,
    clienteBId: clienteB.id,
  };
}

// periodoSql: expressão SQL já pronta (ex.: "tstzrange('2026-01-01', '2026-01-02')"), para os
// testes de unidade que precisam passar um período fora do formato canônico [início, fim).
export async function criarReserva(client, ctx, overrides = {}) {
  const {
    clienteId = ctx.clienteAId,
    bicicletaId = ctx.bicicletaId,
    pontoId = ctx.pontoId,
    inicio = '2026-03-10T10:00:00Z',
    fim = '2026-03-10T14:00:00Z',
    periodoSql = null,
    status = 'CONFIRMADA',
    valorAluguelCentavos = 5000,
    valorCaucaoCentavos = 0,
    canceladaEm = null,
    codigo = null,
  } = overrides;

  const periodo = periodoSql ?? `tstzrange($4::timestamptz, $5::timestamptz, '[)')`;
  const valores = periodoSql ? [clienteId, bicicletaId, pontoId] : [clienteId, bicicletaId, pontoId, inicio, fim];
  const offset = valores.length;

  const { rows: [reserva] } = await client.query(
    `INSERT INTO reserva
       (codigo, cliente_id, bicicleta_id, ponto_id, periodo, status,
        valor_aluguel_centavos, valor_caucao_centavos, cancelada_em)
     VALUES
       (coalesce($${offset + 1}, 'RES-TESTE-' || substr(md5(random()::text), 1, 8)),
        $1, $2, $3, ${periodo}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})
     RETURNING id`,
    [...valores, codigo, status, valorAluguelCentavos, valorCaucaoCentavos, canceladaEm],
  );
  return reserva.id;
}

export async function criarPagamento(client, reservaId, overrides = {}) {
  const {
    metodo = 'PIX',
    valorCentavos = 5000,
    status = 'PENDENTE',
    mpPaymentId = null,
    pagoEm = null,
  } = overrides;

  const { rows: [pagamento] } = await client.query(
    `INSERT INTO pagamento (reserva_id, metodo, valor_centavos, status, mp_payment_id, pago_em)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [reservaId, metodo, valorCentavos, status, mpPaymentId, pagoEm],
  );
  return pagamento.id;
}

export async function criarOperador(client, email = 'teste-operador@bikeilha.test') {
  const { rows: [operador] } = await client.query(
    `INSERT INTO usuario (perfil, nome, email, senha_hash)
     VALUES ('OPERADOR', 'Operador de teste', $1, 'hash')
     RETURNING id`,
    [email],
  );
  return operador.id;
}

export async function criarMovimentacao(client, reservaId, operadorId, overrides = {}) {
  const { tipo = 'RETIRADA', checklist = [], observacoes = null } = overrides;
  const { rows: [movimentacao] } = await client.query(
    `INSERT INTO movimentacao (reserva_id, operador_id, tipo, checklist, observacoes)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     RETURNING id`,
    [reservaId, operadorId, tipo, JSON.stringify(checklist), observacoes],
  );
  return movimentacao.id;
}
