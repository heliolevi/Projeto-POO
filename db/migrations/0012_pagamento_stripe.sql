-- migrate:up

-- ---------------------------------------------------------------------------
-- Pagamento com a Stripe (rotas 16, 17 e 18, docs/contrato-api-mvp.md)
--
-- 1. No máximo UM pagamento PENDENTE ou APROVADO por reserva. A rota 16 já trava a reserva
--    (FOR UPDATE) antes de criar a cobrança; o índice garante a regra no banco mesmo assim, para
--    a mesma reserva nunca ter dois Pix em aberto nem ser paga duas vezes.
-- 2. cliente_do_pagamento(): o aviso da Stripe (webhook) chega sem sessão de usuário, e a RLS de
--    pagamento só deixa o cliente dono (ou a equipe) ver a linha. A função diz de quem é a
--    cobrança, e o app processa o aviso com a sessão desse cliente, passando pelas mesmas
--    políticas das outras rotas. Devolve só o id do cliente, nada mais.
--
-- mp_payment_id passa a guardar o id do PaymentIntent da Stripe ("pi_..."). O nome da coluna
-- ficou do tempo em que o meio previsto era o Mercado Pago; continua único.
-- ---------------------------------------------------------------------------

-- 1. Um pagamento em aberto ou aprovado por reserva ----------------------------------------
CREATE UNIQUE INDEX pagamento_um_ativo_por_reserva
  ON pagamento (reserva_id)
  WHERE status IN ('PENDENTE', 'APROVADO');

COMMENT ON INDEX pagamento_um_ativo_por_reserva IS 'No máximo um pagamento PENDENTE ou APROVADO por reserva: não há dois Pix em aberto nem pagamento em dobro.';

COMMENT ON COLUMN pagamento.mp_payment_id IS 'Identificador da cobrança no meio de pagamento (Stripe: id do PaymentIntent, "pi_..."). Único: o mesmo aviso (webhook) não confirma o pagamento duas vezes.';
COMMENT ON COLUMN pagamento.qr_code_pix IS 'Conteúdo do QR Code Pix (copia e cola) devolvido pela Stripe.';

-- 2. Dono de uma cobrança ------------------------------------------------------------------
CREATE FUNCTION cliente_do_pagamento(p_id_externo text) RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.cliente_id
  FROM pagamento p
  JOIN reserva r ON r.id = p.reserva_id
  WHERE p.mp_payment_id = p_id_externo
$$;

REVOKE ALL ON FUNCTION cliente_do_pagamento(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cliente_do_pagamento(text) TO app_backend;

COMMENT ON FUNCTION cliente_do_pagamento(text) IS 'Id do cliente dono do pagamento ligado à cobrança p_id_externo (PaymentIntent da Stripe), ou null. Usada pelo webhook, que chega sem sessão.';

-- migrate:down

DROP FUNCTION IF EXISTS cliente_do_pagamento(text);
DROP INDEX IF EXISTS pagamento_um_ativo_por_reserva;
COMMENT ON COLUMN pagamento.mp_payment_id IS 'Identificador do pagamento no Mercado Pago. Único: o mesmo aviso (webhook) não confirma o pagamento duas vezes.';
COMMENT ON COLUMN pagamento.qr_code_pix IS 'Conteúdo do QR Code Pix (copia e cola), enquanto o pagamento está pendente.';
