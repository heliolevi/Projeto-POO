-- migrate:up

-- ---------------------------------------------------------------------------
-- Peças que o módulo reservas (POST/GET /api/reservas) precisa e que a segurança por linha
-- bloqueia para o papel do cliente:
--
-- 1. O cliente não lê a tabela bicicleta (só a equipe, 0005) e só enxerga as próprias reservas
--    (0006). Uma consulta feita com o papel dele não consegue escolher "uma unidade do tipo sem
--    reserva sobreposta": não vê as unidades e não vê as reservas dos outros.
--    escolher_unidade_para_reserva() faz essa escolha com os direitos do dono.
-- 2. O objeto reserva do contrato traz o tipo e o ponto, que se chega pela bicicleta, que o
--    cliente também não lê. A view reserva_detalhada monta esse objeto, filtrada pela sessão
--    como a política de reserva, e nunca mostra qual unidade foi escolhida (o código da
--    bicicleta é só da equipe).
-- ---------------------------------------------------------------------------

-- 1. Escolha da unidade ------------------------------------------------------------------
-- Devolve no máximo uma unidade: DISPONIVEL, de tipo e ponto ativos, sem reserva ativa
-- (PENDENTE_PAGAMENTO, CONFIRMADA ou EM_ANDAMENTO) que se sobreponha a [inicio, fim), fora das
-- unidades de p_excluir. A ordem é pelo código, para a escolha ser previsível.
--
-- FOR UPDATE SKIP LOCKED: a unidade fica travada até o fim da transação de quem chamou, e uma
-- transação concorrente pula as travadas em vez de esperar, então dois clientes que reservam ao
-- mesmo tempo recebem unidades diferentes. Se mesmo assim duas reservas chegarem à mesma
-- unidade (a outra confirmou entre a consulta e a trava), a exclusion constraint da 0006
-- recusa com 23P01 e quem chamou tenta de novo passando a unidade em p_excluir.
--
-- Só atende quem tem sessão (cliente ou equipe); sem sessão não devolve nada. Não vaza dado de
-- ninguém: devolve só o id da unidade e do ponto.
CREATE FUNCTION escolher_unidade_para_reserva(
  p_tipo_id  uuid,
  p_inicio   timestamptz,
  p_fim      timestamptz,
  p_excluir  uuid[] DEFAULT '{}'
) RETURNS TABLE (bicicleta_id uuid, ponto_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_inicio IS NULL OR p_fim IS NULL OR p_inicio >= p_fim THEN
    RAISE EXCEPTION 'periodo invalido: o inicio deve ser anterior ao fim'
      USING ERRCODE = '22023';
  END IF;

  IF sessao_perfil() IS NULL OR sessao_perfil() NOT IN ('CLIENTE', 'OPERADOR', 'ADMIN') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT b.id, b.ponto_id
  FROM bicicleta b
  JOIN tipo_bicicleta t ON t.id = b.tipo_id
  JOIN ponto p ON p.id = b.ponto_id
  WHERE b.tipo_id = p_tipo_id
    AND b.status = 'DISPONIVEL'
    AND t.ativo
    AND p.ativo
    AND b.id <> ALL (coalesce(p_excluir, '{}'))
    AND NOT EXISTS (
      SELECT 1
      FROM reserva r
      WHERE r.bicicleta_id = b.id
        AND r.status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADA', 'EM_ANDAMENTO')
        AND r.periodo && tstzrange(p_inicio, p_fim, '[)')
    )
  ORDER BY b.codigo
  LIMIT 1
  FOR UPDATE OF b SKIP LOCKED;
END;
$$;

REVOKE ALL ON FUNCTION escolher_unidade_para_reserva(uuid, timestamptz, timestamptz, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION escolher_unidade_para_reserva(uuid, timestamptz, timestamptz, uuid[]) TO app_backend;

COMMENT ON FUNCTION escolher_unidade_para_reserva(uuid, timestamptz, timestamptz, uuid[]) IS 'Escolhe e trava (FOR UPDATE SKIP LOCKED) uma unidade livre do tipo no período [inicio, fim), fora de p_excluir. Enxerga as reservas de todos os clientes (SECURITY DEFINER). Sem sessão, não devolve nada.';

-- 2. Leitura das reservas ---------------------------------------------------------------
-- Roda com os direitos de quem criou a view (por isso o filtro de sessão está nela);
-- security_barrier impede que condições de quem consulta rodem antes do filtro. O mesmo
-- critério da política de reserva: o cliente vê as próprias, a equipe vê todas, o visitante
-- nenhuma. Do pagamento vem o mais recente (status e método).
CREATE VIEW reserva_detalhada WITH (security_barrier = true) AS
  SELECT r.id,
         r.codigo,
         r.status,
         t.id   AS tipo_id,
         t.nome AS tipo_nome,
         p.id   AS ponto_id,
         p.nome AS ponto_nome,
         concat_ws(', ', p.logradouro, p.numero, nullif(p.complemento, ''), p.bairro) AS ponto_endereco,
         lower(r.periodo) AS inicio,
         upper(r.periodo) AS fim,
         r.valor_aluguel_centavos,
         r.valor_caucao_centavos,
         r.criado_em,
         pg.status AS pagamento_status,
         pg.metodo AS pagamento_metodo
  FROM reserva r
  JOIN bicicleta b ON b.id = r.bicicleta_id
  JOIN tipo_bicicleta t ON t.id = b.tipo_id
  JOIN ponto p ON p.id = r.ponto_id
  LEFT JOIN LATERAL (
    SELECT pag.status, pag.metodo
    FROM pagamento pag
    WHERE pag.reserva_id = r.id
    ORDER BY pag.criado_em DESC
    LIMIT 1
  ) pg ON true
  WHERE (sessao_perfil() = 'CLIENTE' AND r.cliente_id = sessao_usuario_id())
     OR sessao_perfil() IN ('OPERADOR', 'ADMIN');

GRANT SELECT ON reserva_detalhada TO app_backend;

COMMENT ON VIEW reserva_detalhada IS 'Reservas com tipo, ponto e último pagamento, para o objeto reserva da API. Filtrada pela sessão (cliente: as próprias; equipe: todas). Não expõe a unidade da bicicleta.';

-- migrate:down

DROP VIEW IF EXISTS reserva_detalhada;
DROP FUNCTION IF EXISTS escolher_unidade_para_reserva(uuid, timestamptz, timestamptz, uuid[]);
