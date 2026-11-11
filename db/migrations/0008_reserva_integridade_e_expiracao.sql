-- migrate:up

-- ---------------------------------------------------------------------------
-- Revisão da 0006 (reserva e pagamento). A 0006 já está aplicada e não é editada: tudo o que a
-- revisão achou vem aqui.
--
-- 1. Período finito: a 0006 só exige [início, fim) e não vazio, mas aceita fim aberto
--    ("[2026-05-01,)") ou "infinity", e uma reserva assim seguraria a bicicleta para sempre.
-- 2. atualizado_em em reserva e pagamento (as duas tabelas só tinham criado_em), mantido pelo
--    mesmo trigger das demais tabelas.
-- 3. Índice (cliente_id, status) para "minhas reservas", com ou sem filtro de status.
-- 4. Índice parcial das pendentes, que é o que a expiração percorre.
-- 5. expirar_reservas_vencidas(): marca como EXPIRADA a pendente de pagamento há 15 minutos ou
--    mais (docs/contrato-api-mvp.md) e libera a bicicleta.
-- ---------------------------------------------------------------------------

-- 1. Período finito e crescente -----------------------------------------------------------
ALTER TABLE reserva
  ADD CONSTRAINT reserva_periodo_finito
  CHECK (
    NOT lower_inf(periodo)
    AND NOT upper_inf(periodo)
    AND lower(periodo) > '-infinity'::timestamptz
    AND upper(periodo) < 'infinity'::timestamptz
    AND lower(periodo) < upper(periodo)
  );

COMMENT ON CONSTRAINT reserva_periodo_finito ON reserva IS 'Início e fim definidos, finitos, com início antes do fim.';

-- 2. atualizado_em ------------------------------------------------------------------------
ALTER TABLE reserva   ADD COLUMN atualizado_em timestamptz NOT NULL DEFAULT now();
ALTER TABLE pagamento ADD COLUMN atualizado_em timestamptz NOT NULL DEFAULT now();

-- linhas que já existem: a última alteração conhecida é a criação (os triggers vêm depois, para
-- este UPDATE não sobrescrever o valor com now())
UPDATE reserva   SET atualizado_em = criado_em;
UPDATE pagamento SET atualizado_em = criado_em;

CREATE TRIGGER reserva_atualizado_em
  BEFORE UPDATE ON reserva
  FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();

CREATE TRIGGER pagamento_atualizado_em
  BEFORE UPDATE ON pagamento
  FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();

-- 3. Índice das reservas do cliente -------------------------------------------------------
-- (cliente_id, status) atende também as consultas só por cliente, então o índice só de
-- cliente_id da 0006 passa a ser redundante.
CREATE INDEX reserva_cliente_status_idx ON reserva (cliente_id, status);
DROP INDEX reserva_cliente_idx;

-- 4. Índice das pendentes -----------------------------------------------------------------
CREATE INDEX reserva_pendente_criado_idx ON reserva (criado_em) WHERE status = 'PENDENTE_PAGAMENTO';

-- 5. Expiração das pendentes --------------------------------------------------------------
-- Devolve quantas reservas expirou. Roda com os direitos de quem criou a função (SECURITY
-- DEFINER) porque a segurança por linha só deixa o cliente ver as próprias reservas, e a
-- expiração vale para todas. Não recebe parâmetros de propósito: o prazo é regra do sistema, e
-- um parâmetro deixaria qualquer cliente expirar reservas de outros. search_path fixo impede que
-- um objeto criado em outro schema substitua as tabelas.
--
-- FOR UPDATE SKIP LOCKED: se o webhook do Mercado Pago está confirmando a reserva neste exato
-- momento, ela fica de fora desta rodada em vez de esperar ou ser expirada por cima. Reserva com
-- pagamento APROVADO também nunca expira (o webhook pode ter gravado o pagamento antes de a
-- reserva virar CONFIRMADA). Os pagamentos PENDENTE das reservas expiradas viram EXPIRADO.
CREATE FUNCTION expirar_reservas_vencidas() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  total integer;
BEGIN
  WITH vencidas AS (
    SELECT r.id
    FROM reserva r
    WHERE r.status = 'PENDENTE_PAGAMENTO'
      AND r.criado_em <= now() - interval '15 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM pagamento p WHERE p.reserva_id = r.id AND p.status = 'APROVADO'
      )
    ORDER BY r.id
    FOR UPDATE OF r SKIP LOCKED
  ),
  expiradas AS (
    UPDATE reserva r
    SET status = 'EXPIRADA'
    FROM vencidas v
    WHERE r.id = v.id
    RETURNING r.id
  ),
  pagamentos AS (
    UPDATE pagamento p
    SET status = 'EXPIRADO'
    FROM expiradas e
    WHERE p.reserva_id = e.id AND p.status = 'PENDENTE'
    RETURNING p.id
  )
  SELECT count(*) INTO total FROM expiradas;

  RETURN total;
END;
$$;

REVOKE ALL ON FUNCTION expirar_reservas_vencidas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION expirar_reservas_vencidas() TO app_backend;

COMMENT ON FUNCTION expirar_reservas_vencidas() IS 'Marca como EXPIRADA a reserva PENDENTE_PAGAMENTO criada há 15 minutos ou mais (sem pagamento aprovado) e expira seus pagamentos PENDENTE. Devolve quantas reservas expirou.';

-- migrate:down

DROP FUNCTION IF EXISTS expirar_reservas_vencidas();

DROP INDEX IF EXISTS reserva_pendente_criado_idx;
CREATE INDEX reserva_cliente_idx ON reserva (cliente_id);
DROP INDEX IF EXISTS reserva_cliente_status_idx;

DROP TRIGGER IF EXISTS pagamento_atualizado_em ON pagamento;
DROP TRIGGER IF EXISTS reserva_atualizado_em ON reserva;
ALTER TABLE pagamento DROP COLUMN IF EXISTS atualizado_em;
ALTER TABLE reserva   DROP COLUMN IF EXISTS atualizado_em;

ALTER TABLE reserva DROP CONSTRAINT IF EXISTS reserva_periodo_finito;
