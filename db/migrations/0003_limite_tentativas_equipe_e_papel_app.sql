-- migrate:up

-- ---------------------------------------------------------------------------
-- Limite de tentativas (login e cadastro)
--
-- Uma linha por chave (ex.: login:ip:1.2.3.4) com a contagem da janela atual. Fica no banco
-- porque no ambiente serverless a memória de uma instância não é vista pelas outras.
-- ---------------------------------------------------------------------------
CREATE TABLE limite_tentativas (
  chave         text PRIMARY KEY,
  janela_inicio timestamptz NOT NULL DEFAULT now(),
  contagem      integer NOT NULL
);

CREATE INDEX limite_tentativas_janela_idx ON limite_tentativas (janela_inicio);

COMMENT ON TABLE limite_tentativas IS 'Contagem de tentativas por chave e janela de tempo. Linhas com mais de um dia são apagadas pelo app.';

-- ---------------------------------------------------------------------------
-- A equipe da locadora não lê comissão nem conta de recebimento
--
-- A política locadora_equipe_le liberava a linha inteira da locadora para o operador, com
-- CNPJ, comissão e conta de recebimento. RLS filtra linhas, não colunas (o mesmo problema
-- que a 0002 resolveu para o público). A tabela passa a ser lida só pelo gerente; o
-- operador usa a view locadora_equipe.
-- ---------------------------------------------------------------------------
DROP POLICY locadora_equipe_le ON locadora;

CREATE POLICY locadora_gerente_le ON locadora FOR SELECT
  USING (id = sessao_locadora_id() AND sessao_perfil() = 'GERENTE_LOCADORA');

-- Como a locadora_catalogo, roda com os direitos de quem criou a view; por isso o filtro
-- da própria locadora e do perfil está nela.
CREATE VIEW locadora_equipe WITH (security_barrier = true) AS
  SELECT id, razao_social, nome_fantasia, email, telefone, status,
         documentos_exigidos, regras_caucao
  FROM locadora
  WHERE id = sessao_locadora_id()
    AND sessao_perfil() IN ('OPERADOR', 'GERENTE_LOCADORA');

COMMENT ON VIEW locadora_equipe IS 'Dados da própria locadora para a equipe, sem CNPJ, comissão nem conta de recebimento.';

-- ---------------------------------------------------------------------------
-- Papel do aplicativo
--
-- O dono do banco ignora a RLS. O app deve conectar com um papel que a respeite: este é o
-- grupo de permissões (NOLOGIN). O papel de login, com senha, é criado fora do repositório
-- e entra neste grupo (passo a passo em db/README.md).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_backend') THEN
    CREATE ROLE app_backend NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_backend;
GRANT SELECT, INSERT, UPDATE ON usuario, locadora TO app_backend;
GRANT SELECT, INSERT, UPDATE, DELETE ON ponto, limite_tentativas TO app_backend;
GRANT SELECT ON locadora_catalogo, locadora_equipe TO app_backend;

-- a tabela de controle é criada pelo runner de migrations
DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    GRANT SELECT ON schema_migrations TO app_backend;
  END IF;
END
$$;

-- migrate:down

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_backend') THEN
    DROP OWNED BY app_backend;
    DROP ROLE app_backend;
  END IF;
END
$$;

DROP VIEW IF EXISTS locadora_equipe;

DROP POLICY IF EXISTS locadora_gerente_le ON locadora;
CREATE POLICY locadora_equipe_le ON locadora FOR SELECT
  USING (id = sessao_locadora_id());

DROP TABLE IF EXISTS limite_tentativas;
