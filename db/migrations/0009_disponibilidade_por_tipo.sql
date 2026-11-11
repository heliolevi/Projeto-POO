-- migrate:up

-- ---------------------------------------------------------------------------
-- Disponibilidade por tipo, para a busca e a recomendação.
--
-- Problema que a 0008 deixou de fora: a segurança por linha de reserva só mostra ao cliente as
-- próprias reservas. A consulta "quantas unidades livres no período" feita com o papel do
-- cliente não enxerga as reservas dos outros e conta como livre uma bicicleta já reservada
-- (medido: 190 livres contra 120 reais). A exclusion constraint impede a reserva dupla, mas a
-- vitrine mostraria o que não está disponível.
--
-- A função roda com os direitos do dono (SECURITY DEFINER), então enxerga todas as reservas, e
-- devolve apenas o número de unidades livres por tipo: nada de quem reservou nem de qual
-- unidade. A altura do cliente e a pontuação continuam na aplicação (src/modules/recomendacao).
--
-- Regra (docs/modelo-de-dados.md): unidade DISPONIVEL de tipo ativo, sem reserva
-- PENDENTE_PAGAMENTO, CONFIRMADA ou EM_ANDAMENTO que se sobreponha ao período [inicio, fim).
-- p_ponto_id é opcional: nulo conta a frota toda.
-- ---------------------------------------------------------------------------
CREATE FUNCTION unidades_livres_por_tipo(
  p_inicio   timestamptz,
  p_fim      timestamptz,
  p_ponto_id uuid DEFAULT NULL
) RETURNS TABLE (tipo_id uuid, unidades_livres integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_inicio IS NULL OR p_fim IS NULL OR p_inicio >= p_fim THEN
    RAISE EXCEPTION 'periodo invalido: o inicio deve ser anterior ao fim'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT b.tipo_id, count(*)::integer
  FROM bicicleta b
  JOIN tipo_bicicleta t ON t.id = b.tipo_id
  WHERE b.status = 'DISPONIVEL'
    AND t.ativo
    AND (p_ponto_id IS NULL OR b.ponto_id = p_ponto_id)
    AND NOT EXISTS (
      SELECT 1
      FROM reserva r
      WHERE r.bicicleta_id = b.id
        AND r.status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADA', 'EM_ANDAMENTO')
        AND r.periodo && tstzrange(p_inicio, p_fim, '[)')
    )
  GROUP BY b.tipo_id;
END;
$$;

REVOKE ALL ON FUNCTION unidades_livres_por_tipo(timestamptz, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION unidades_livres_por_tipo(timestamptz, timestamptz, uuid) TO app_backend;

COMMENT ON FUNCTION unidades_livres_por_tipo(timestamptz, timestamptz, uuid) IS 'Unidades livres por tipo ativo no período [inicio, fim), opcionalmente num ponto. Enxerga as reservas de todos os clientes (SECURITY DEFINER) e devolve só contagens. Tipos sem unidade livre não aparecem.';

-- migrate:down

DROP FUNCTION IF EXISTS unidades_livres_por_tipo(timestamptz, timestamptz, uuid);
