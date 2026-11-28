-- migrate:up

-- ---------------------------------------------------------------------------
-- Catálogo público de locadoras
--
-- A política locadora_publica deixava qualquer sessão ler as linhas das locadoras ativas
-- com todas as colunas, inclusive CNPJ, e-mail, comissão e conta de recebimento. RLS filtra
-- linhas, não colunas, então o que o público pode ver passa a ser uma view com só os campos
-- que o aplicativo exibe. A tabela locadora fica restrita à equipe da própria locadora e à
-- administração da plataforma.
-- ---------------------------------------------------------------------------
DROP POLICY locadora_publica ON locadora;

-- A view é executada com os direitos de quem a criou, por isso o filtro de status está nela.
-- security_barrier impede que condições de quem consulta rodem antes do filtro de status,
-- o que poderia revelar linhas de locadoras que não estão ativas.
CREATE VIEW locadora_catalogo WITH (security_barrier = true) AS
  SELECT id, nome_fantasia, telefone, documentos_exigidos, regras_caucao
  FROM locadora
  WHERE status = 'ATIVA';

COMMENT ON VIEW locadora_catalogo IS 'Dados públicos das locadoras ativas. Visitantes e clientes consultam esta view, nunca a tabela locadora.';

-- ponto_publico consultava locadora, o que dependia da política removida acima.
-- Esta função lê só o status, ignorando a RLS, e devolve apenas verdadeiro ou falso.
CREATE FUNCTION locadora_esta_ativa(p_locadora_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM locadora WHERE id = p_locadora_id AND status = 'ATIVA')
$$;

DROP POLICY ponto_publico ON ponto;
CREATE POLICY ponto_publico ON ponto FOR SELECT
  USING (ativo AND locadora_esta_ativa(locadora_id));

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------
-- A chave estrangeira usuario -> ponto não tinha índice: apagar ou alterar um ponto
-- varreria a tabela de usuários inteira.
CREATE INDEX usuario_ponto_idx ON usuario (ponto_id) WHERE ponto_id IS NOT NULL;

-- migrate:down

DROP INDEX IF EXISTS usuario_ponto_idx;

DROP POLICY IF EXISTS ponto_publico ON ponto;
CREATE POLICY ponto_publico ON ponto FOR SELECT
  USING (
    ativo
    AND EXISTS (SELECT 1 FROM locadora l WHERE l.id = ponto.locadora_id AND l.status = 'ATIVA')
  );

DROP FUNCTION IF EXISTS locadora_esta_ativa(uuid);
DROP VIEW IF EXISTS locadora_catalogo;

CREATE POLICY locadora_publica ON locadora FOR SELECT
  USING (status = 'ATIVA');
