-- migrate:up

-- ---------------------------------------------------------------------------
-- Reserva e pagamento (docs/modelo-de-dados.md)
--
-- periodo é um tstzrange (início incluso, fim exclusivo). A exclusion constraint com
-- btree_gist (já habilitada na 0001) impede que duas reservas ativas da mesma bicicleta se
-- sobreponham; reservas CANCELADA, EXPIRADA, NAO_RETIRADA e CONCLUIDA ficam de fora e liberam
-- a bicicleta. mp_payment_id é único para o mesmo aviso do Mercado Pago (webhook) não
-- confirmar o mesmo pagamento duas vezes.
-- ---------------------------------------------------------------------------
CREATE TYPE status_reserva AS ENUM (
  'PENDENTE_PAGAMENTO', 'CONFIRMADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA', 'EXPIRADA', 'NAO_RETIRADA'
);
CREATE TYPE metodo_pagamento AS ENUM ('PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO');
CREATE TYPE status_pagamento AS ENUM ('PENDENTE', 'APROVADO', 'RECUSADO', 'ESTORNADO', 'EXPIRADO');

CREATE TABLE reserva (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                 text NOT NULL,
  cliente_id             uuid NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
  bicicleta_id           uuid NOT NULL REFERENCES bicicleta (id) ON DELETE RESTRICT,
  ponto_id               uuid NOT NULL REFERENCES ponto (id) ON DELETE RESTRICT,
  periodo                tstzrange NOT NULL,
  status                 status_reserva NOT NULL DEFAULT 'PENDENTE_PAGAMENTO',
  valor_aluguel_centavos integer NOT NULL,
  valor_caucao_centavos  integer NOT NULL DEFAULT 0,
  criado_em              timestamptz NOT NULL DEFAULT now(),
  cancelada_em           timestamptz,

  CONSTRAINT reserva_codigo_unico UNIQUE (codigo),
  -- início incluso e fim exclusivo: duas reservas "encostadas" (fim de uma = início da outra)
  -- não se sobrepõem.
  CONSTRAINT reserva_periodo_formato
    CHECK (NOT isempty(periodo) AND lower_inc(periodo) AND NOT upper_inc(periodo)),
  CONSTRAINT reserva_valores_validos
    CHECK (valor_aluguel_centavos >= 0 AND valor_caucao_centavos >= 0),
  CONSTRAINT reserva_cancelada_em_consistente
    CHECK ((status = 'CANCELADA') = (cancelada_em IS NOT NULL)),

  -- duas reservas ativas da mesma bicicleta não podem se sobrepor no tempo
  CONSTRAINT reserva_sem_sobreposicao
    EXCLUDE USING gist (bicicleta_id WITH =, periodo WITH &&)
    WHERE (status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADA', 'EM_ANDAMENTO'))
);

CREATE INDEX reserva_cliente_idx ON reserva (cliente_id);
CREATE INDEX reserva_ponto_idx ON reserva (ponto_id);

COMMENT ON TABLE reserva IS 'Reserva de uma bicicleta por um cliente, por um período. A exclusion constraint impede sobreposição entre reservas ativas da mesma bicicleta.';
COMMENT ON COLUMN reserva.periodo IS 'Início (incluso) e fim (exclusivo) da reserva.';
COMMENT ON COLUMN reserva.status IS 'PENDENTE_PAGAMENTO, CONFIRMADA e EM_ANDAMENTO seguram a bicicleta (entram na exclusion constraint); os demais a liberam.';

CREATE TABLE pagamento (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id     uuid NOT NULL REFERENCES reserva (id) ON DELETE RESTRICT,
  metodo         metodo_pagamento NOT NULL,
  valor_centavos integer NOT NULL,
  status         status_pagamento NOT NULL DEFAULT 'PENDENTE',
  mp_payment_id  text,
  qr_code_pix    text,
  pix_expira_em  timestamptz,
  pago_em        timestamptz,
  criado_em      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pagamento_mp_payment_id_unico UNIQUE (mp_payment_id),
  CONSTRAINT pagamento_valor_valido CHECK (valor_centavos >= 0),
  CONSTRAINT pagamento_pago_em_consistente CHECK ((status = 'APROVADO') = (pago_em IS NOT NULL))
);

CREATE INDEX pagamento_reserva_idx ON pagamento (reserva_id);

COMMENT ON TABLE pagamento IS 'Pagamento de uma reserva via Mercado Pago, em centavos.';
COMMENT ON COLUMN pagamento.mp_payment_id IS 'Identificador do pagamento no Mercado Pago. Único: o mesmo aviso (webhook) não confirma o pagamento duas vezes.';
COMMENT ON COLUMN pagamento.qr_code_pix IS 'Conteúdo do QR Code Pix (copia e cola), enquanto o pagamento está pendente.';

-- ---------------------------------------------------------------------------
-- Segurança por linha
--
-- Cliente: só as próprias reservas, e só os pagamentos das próprias reservas (pagamento não
-- tem cliente_id). Operador e administrador: tudo, porque a retirada e a devolução dependem
-- de ver todas as reservas.
-- ---------------------------------------------------------------------------
ALTER TABLE reserva   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY reserva_equipe ON reserva
  USING (sessao_perfil() IN ('OPERADOR', 'ADMIN'))
  WITH CHECK (sessao_perfil() IN ('OPERADOR', 'ADMIN'));

CREATE POLICY reserva_cliente ON reserva
  USING (sessao_perfil() = 'CLIENTE' AND cliente_id = sessao_usuario_id())
  WITH CHECK (sessao_perfil() = 'CLIENTE' AND cliente_id = sessao_usuario_id());

CREATE POLICY pagamento_equipe ON pagamento
  USING (sessao_perfil() IN ('OPERADOR', 'ADMIN'))
  WITH CHECK (sessao_perfil() IN ('OPERADOR', 'ADMIN'));

CREATE POLICY pagamento_cliente ON pagamento
  USING (
    sessao_perfil() = 'CLIENTE'
    AND EXISTS (SELECT 1 FROM reserva r WHERE r.id = pagamento.reserva_id AND r.cliente_id = sessao_usuario_id())
  )
  WITH CHECK (
    sessao_perfil() = 'CLIENTE'
    AND EXISTS (SELECT 1 FROM reserva r WHERE r.id = pagamento.reserva_id AND r.cliente_id = sessao_usuario_id())
  );

-- ---------------------------------------------------------------------------
-- Permissões do papel do aplicativo (app_backend)
-- Sem DELETE: uma reserva ou pagamento muda de status (CANCELADA, ESTORNADO etc.), nunca é apagado.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON reserva, pagamento TO app_backend;

-- migrate:down

REVOKE SELECT, INSERT, UPDATE ON reserva, pagamento FROM app_backend;

DROP TABLE IF EXISTS pagamento;
DROP TABLE IF EXISTS reserva;

DROP TYPE IF EXISTS status_pagamento;
DROP TYPE IF EXISTS metodo_pagamento;
DROP TYPE IF EXISTS status_reserva;
