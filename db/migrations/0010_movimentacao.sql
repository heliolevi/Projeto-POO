-- migrate:up

-- ---------------------------------------------------------------------------
-- Movimentação: a retirada e a devolução de uma reserva (docs/modelo-de-dados.md)
--
-- UNIQUE (reserva_id, tipo): no máximo uma retirada e uma devolução por reserva.
--
-- Decisão do MVP: a disponibilidade da bicicleta vem das reservas (exclusion constraint da
-- 0006). bicicleta.status só marca MANUTENCAO ou BLOQUEADA; a movimentação não altera o status
-- da bicicleta.
-- ---------------------------------------------------------------------------
CREATE TYPE tipo_movimentacao AS ENUM ('RETIRADA', 'DEVOLUCAO');

CREATE TABLE movimentacao (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id  uuid NOT NULL REFERENCES reserva (id) ON DELETE RESTRICT,
  operador_id uuid NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
  tipo        tipo_movimentacao NOT NULL,
  data_hora   timestamptz NOT NULL DEFAULT now(),
  checklist   jsonb NOT NULL DEFAULT '[]'::jsonb,
  observacoes text,

  CONSTRAINT movimentacao_reserva_tipo_unico UNIQUE (reserva_id, tipo),
  CONSTRAINT movimentacao_checklist_lista CHECK (jsonb_typeof(checklist) = 'array')
);

CREATE INDEX movimentacao_operador_idx ON movimentacao (operador_id);

COMMENT ON TABLE movimentacao IS 'Retirada ou devolução de uma reserva, registrada por um operador. No máximo uma de cada tipo por reserva.';
COMMENT ON COLUMN movimentacao.checklist IS 'Lista (jsonb array) com os itens conferidos na retirada ou devolução.';

-- ---------------------------------------------------------------------------
-- Segurança por linha
--
-- Operador e administrador: leem e escrevem tudo na tabela. O cliente NÃO acessa a tabela: as
-- observacoes são anotações internas do atendente. Ele lê só pela view movimentacao_cliente
-- (abaixo), com as movimentações das próprias reservas, sem observacoes nem operador_id, e
-- nunca escreve. O app usa o mesmo papel (app_backend) para todos os perfis, então esconder uma
-- coluna só do cliente não cabe em GRANT por coluna; por isso a view.
-- ---------------------------------------------------------------------------
ALTER TABLE movimentacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY movimentacao_equipe ON movimentacao
  USING (sessao_perfil() IN ('OPERADOR', 'ADMIN'))
  WITH CHECK (sessao_perfil() IN ('OPERADOR', 'ADMIN'));

-- Leitura do cliente. A view roda com os direitos do dono (passa por cima da RLS da tabela), e o
-- próprio WHERE limita às movimentações das reservas da sessão. Sem sessão de CLIENTE, 0 linhas.
CREATE VIEW movimentacao_cliente AS
  SELECT m.id, m.reserva_id, m.tipo, m.data_hora, m.checklist
  FROM movimentacao m
  JOIN reserva r ON r.id = m.reserva_id
  WHERE sessao_perfil() = 'CLIENTE'
    AND r.cliente_id = sessao_usuario_id();

COMMENT ON VIEW movimentacao_cliente IS 'Movimentações das reservas do cliente da sessão, sem observacoes (internas) nem operador_id.';

-- Sem DELETE: uma movimentação registrada não é apagada.
GRANT SELECT, INSERT, UPDATE ON movimentacao TO app_backend;
GRANT SELECT ON movimentacao_cliente TO app_backend;

-- migrate:down

REVOKE SELECT ON movimentacao_cliente FROM app_backend;
REVOKE SELECT, INSERT, UPDATE ON movimentacao FROM app_backend;

DROP VIEW IF EXISTS movimentacao_cliente;
DROP TABLE IF EXISTS movimentacao;
DROP TYPE IF EXISTS tipo_movimentacao;
