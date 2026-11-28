-- migrate:up

-- ---------------------------------------------------------------------------
-- Uma única locadora
--
-- O projeto deixou de ser uma plataforma com várias locadoras (docs/mudanca-de-escopo.md,
-- fase 1). Esta migration leva o banco do modelo anterior (0001 a 0003) para o modelo novo
-- (docs/modelo-de-dados.md):
--
--   - a tabela locadora (várias linhas) vira empresa (uma linha só);
--   - os perfis passam a ser CLIENTE, OPERADOR e ADMIN. GERENTE_LOCADORA e ADMIN_PLATAFORMA
--     viram ADMIN; nivel_acesso e locadora_id deixam de existir;
--   - usuario ganha os dados da recomendação: experiencia e atividade_preferida;
--   - saem as views, as políticas e as funções que isolavam uma locadora da outra; a sessão
--     passa a declarar o usuário (sessao_usuario_id), e a RLS por cliente chega com as reservas.
--
-- Dados que existirem são preservados quando há onde colocá-los: a primeira locadora vira a
-- empresa, os pontos continuam, e os usuários mudam de perfil. Se houver mais de uma locadora,
-- só a mais antiga é mantida e os pontos precisam ter nomes diferentes entre si.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Tipos enumerados novos
-- ---------------------------------------------------------------------------
CREATE TYPE experiencia AS ENUM ('INICIANTE', 'INTERMEDIARIO', 'AVANCADO');
CREATE TYPE atividade   AS ENUM ('PASSEIO', 'URBANO', 'TRILHA', 'ESPORTE', 'TURISMO');

-- ---------------------------------------------------------------------------
-- empresa (um único registro)
--
-- id é um boolean fixo em true, com CHECK e chave primária: o banco impede uma segunda linha.
-- CNPJ, razão social e conta de recebimento ficam só aqui, e nunca chegam ao público.
-- ---------------------------------------------------------------------------
CREATE TABLE empresa (
  id                   boolean PRIMARY KEY DEFAULT true,
  razao_social         text NOT NULL,
  nome_fantasia        text NOT NULL,
  cnpj                 text NOT NULL UNIQUE,
  email                citext NOT NULL,
  telefone             text,
  documentos_exigidos  text[] NOT NULL DEFAULT '{}',
  conta_recebimento_id text,
  atualizado_em        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT empresa_linha_unica CHECK (id),
  CONSTRAINT empresa_cnpj_formato CHECK (cnpj ~ '^[0-9]{14}$')
);

CREATE TRIGGER empresa_atualizado_em
  BEFORE UPDATE ON empresa
  FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();

COMMENT ON TABLE empresa IS 'A locadora. Sempre no máximo uma linha (id é true). Substitui a antiga tabela locadora.';
COMMENT ON COLUMN empresa.cnpj IS 'Somente dígitos, 14 posições. Não é exibido ao público.';
COMMENT ON COLUMN empresa.documentos_exigidos IS 'Documentos que o cliente precisa apresentar na retirada.';
COMMENT ON COLUMN empresa.conta_recebimento_id IS 'Identificador da conta da locadora no Mercado Pago.';

-- Se já existia uma locadora, a mais antiga vira a empresa.
INSERT INTO empresa (razao_social, nome_fantasia, cnpj, email, telefone, documentos_exigidos, conta_recebimento_id)
SELECT razao_social, nome_fantasia, cnpj, email, telefone, documentos_exigidos, conta_recebimento_id
FROM locadora
ORDER BY criado_em
LIMIT 1;

-- ---------------------------------------------------------------------------
-- usuario: sai o vínculo com a locadora e o nível de acesso
-- ---------------------------------------------------------------------------
-- Só OPERADOR guarda ponto_id no modelo novo; os outros perfis ficam sem.
UPDATE usuario SET ponto_id = NULL WHERE perfil::text IN ('GERENTE_LOCADORA', 'ADMIN_PLATAFORMA');

-- Constraints que dependem de locadora_id, nivel_acesso ou dos valores antigos de perfil.
ALTER TABLE usuario DROP CONSTRAINT usuario_ponto_da_locadora;
ALTER TABLE usuario DROP CONSTRAINT usuario_vinculo_locadora;
ALTER TABLE usuario DROP CONSTRAINT usuario_ponto_exige_locadora;
ALTER TABLE usuario DROP CONSTRAINT usuario_nivel_acesso_admin;
ALTER TABLE usuario DROP CONSTRAINT usuario_dados_cliente;

DROP INDEX usuario_locadora_idx;
ALTER TABLE usuario DROP COLUMN locadora_id;
ALTER TABLE usuario DROP COLUMN nivel_acesso;

-- Um enum não perde valores: cria-se o tipo novo e a coluna passa a usá-lo.
-- Os dois perfis de administração antigos viram ADMIN.
ALTER TYPE perfil_usuario RENAME TO perfil_usuario_antigo;
CREATE TYPE perfil_usuario AS ENUM ('CLIENTE', 'OPERADOR', 'ADMIN');

ALTER TABLE usuario
  ALTER COLUMN perfil TYPE perfil_usuario
  USING (
    CASE perfil::text
      WHEN 'GERENTE_LOCADORA' THEN 'ADMIN'
      WHEN 'ADMIN_PLATAFORMA' THEN 'ADMIN'
      ELSE perfil::text
    END
  )::perfil_usuario;

DROP TYPE perfil_usuario_antigo;
DROP TYPE nivel_acesso;

-- Dados da recomendação (opcionais, só de cliente).
ALTER TABLE usuario ADD COLUMN experiencia experiencia;
ALTER TABLE usuario ADD COLUMN atividade_preferida atividade;

COMMENT ON COLUMN usuario.altura_cm IS 'Cliente. Usada na recomendação: filtra os tipos em que ele cabe.';
COMMENT ON COLUMN usuario.experiencia IS 'Cliente. Usada na recomendação, comparada com o nível recomendado do tipo.';
COMMENT ON COLUMN usuario.atividade_preferida IS 'Cliente. Usada na recomendação; pode ser trocada em cada busca.';

-- Regras de cada perfil, como em docs/modelo-de-dados.md:
--   CLIENTE  : CPF e aceite dos termos obrigatórios; sem ponto; dados de recomendação opcionais;
--   OPERADOR : ponto opcional (onde atua); sem dados de cliente;
--   ADMIN    : sem ponto e sem dados de cliente.
ALTER TABLE usuario ADD CONSTRAINT usuario_ponto_so_operador
  CHECK (ponto_id IS NULL OR perfil = 'OPERADOR');

ALTER TABLE usuario ADD CONSTRAINT usuario_dados_cliente CHECK (
  (perfil = 'CLIENTE'
     AND cpf IS NOT NULL
     AND aceite_termos_em IS NOT NULL
     AND versao_termos IS NOT NULL)
  OR
  (perfil <> 'CLIENTE'
     AND cpf IS NULL
     AND data_nascimento IS NULL
     AND altura_cm IS NULL
     AND experiencia IS NULL
     AND atividade_preferida IS NULL
     AND documento_chave IS NULL
     AND aceite_termos_em IS NULL
     AND versao_termos IS NULL)
);

-- ---------------------------------------------------------------------------
-- ponto: sai o vínculo com a locadora
-- ---------------------------------------------------------------------------
-- As políticas antigas de ponto usavam locadora_id e as funções por locadora.
DROP POLICY ponto_admin ON ponto;
DROP POLICY ponto_publico ON ponto;
DROP POLICY ponto_equipe_le ON ponto;
DROP POLICY ponto_gerente_escreve ON ponto;

ALTER TABLE ponto DROP CONSTRAINT ponto_nome_por_locadora;
ALTER TABLE ponto DROP CONSTRAINT ponto_id_locadora;
DROP INDEX ponto_locadora_idx;
ALTER TABLE ponto DROP COLUMN locadora_id;

ALTER TABLE ponto ADD CONSTRAINT ponto_nome_unico UNIQUE (nome);

-- Com um ponto só, a localização (PostGIS) passa a ser opcional: serve para mostrar o ponto
-- no mapa e a distância até o cliente.
ALTER TABLE ponto ALTER COLUMN localizacao DROP NOT NULL;

-- A chave estrangeira que ligava usuario ao ponto era composta (ponto, locadora); agora é simples.
ALTER TABLE usuario ADD CONSTRAINT usuario_ponto_fk
  FOREIGN KEY (ponto_id) REFERENCES ponto (id) ON DELETE RESTRICT;

COMMENT ON TABLE ponto IS 'Local de retirada e devolução da locadora. A devolução é no mesmo ponto da retirada.';
COMMENT ON COLUMN ponto.localizacao IS 'Opcional. Coordenadas WGS 84 (SRID 4326). Use ST_MakePoint(longitude, latitude).';

-- ---------------------------------------------------------------------------
-- Fim do isolamento entre locadoras
-- ---------------------------------------------------------------------------
DROP VIEW locadora_equipe;
DROP VIEW locadora_catalogo;
DROP TABLE locadora;                         -- leva junto o trigger e as políticas da tabela
DROP FUNCTION locadora_protege_campos();
DROP FUNCTION locadora_esta_ativa(uuid);
DROP FUNCTION sessao_locadora_id();
DROP TYPE status_locadora;

-- O backend informa quem está logado no começo de cada transação (helper comSessao):
--   SELECT set_config('app.perfil', 'CLIENTE', true),
--          set_config('app.usuario_id', '<uuid>', true);
-- As políticas de row-level security leem estes valores. sessao_perfil() já existe.
CREATE FUNCTION sessao_usuario_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.usuario_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- Segurança por linha
--
-- Visitante: só os pontos ativos. Equipe (OPERADOR e ADMIN): todos os pontos, e só o ADMIN
-- altera. Para a empresa, RLS filtra linhas e não colunas (o problema que as 0002 e 0003
-- resolveram para locadora): por isso a tabela é só do ADMIN e o público lê a view
-- empresa_publica, que mostra apenas os campos que o aplicativo exibe.
-- As políticas por cliente (reserva, pagamento, notificação) entram com essas tabelas.
-- ---------------------------------------------------------------------------
ALTER TABLE empresa ENABLE ROW LEVEL SECURITY;

CREATE POLICY empresa_admin ON empresa
  USING (sessao_perfil() = 'ADMIN')
  WITH CHECK (sessao_perfil() = 'ADMIN');

-- Roda com os direitos de quem criou a view; security_barrier impede que condições de quem
-- consulta rodem antes do filtro.
CREATE VIEW empresa_publica WITH (security_barrier = true) AS
  SELECT nome_fantasia, telefone, email, documentos_exigidos
  FROM empresa;

COMMENT ON VIEW empresa_publica IS 'Dados públicos da locadora. Visitantes e clientes consultam esta view, nunca a tabela empresa.';

CREATE POLICY ponto_publico ON ponto FOR SELECT
  USING (ativo);

CREATE POLICY ponto_equipe_le ON ponto FOR SELECT
  USING (sessao_perfil() IN ('OPERADOR', 'ADMIN'));

CREATE POLICY ponto_admin_escreve ON ponto
  USING (sessao_perfil() = 'ADMIN')
  WITH CHECK (sessao_perfil() = 'ADMIN');

-- ---------------------------------------------------------------------------
-- Permissões do papel do aplicativo (app_backend, criado na 0003)
-- ---------------------------------------------------------------------------
-- Ao apagar a tabela locadora e as views, as permissões delas sumiram junto. As de usuario,
-- ponto e limite_tentativas continuam; entram as da empresa.
GRANT SELECT, INSERT, UPDATE ON empresa TO app_backend;
GRANT SELECT ON empresa_publica TO app_backend;

-- migrate:down

-- Volta ao modelo de 0001 a 0003. Dados: a empresa volta a ser a locadora (ATIVA, sem comissão);
-- os usuários ADMIN voltam como ADMIN_PLATAFORMA com acesso TOTAL. Os pontos da empresa vão para
-- a locadora recriada. Sem empresa, só dá para voltar se não houver ponto nem OPERADOR; senão a
-- migration para com um erro explicando.

-- Tipos do modelo anterior
CREATE TYPE nivel_acesso    AS ENUM ('SUPORTE', 'FINANCEIRO', 'TOTAL');
CREATE TYPE status_locadora AS ENUM ('PENDENTE', 'ATIVA', 'SUSPENSA', 'INATIVA');

-- Funções do modelo anterior
CREATE FUNCTION sessao_locadora_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.locadora_id', true), '')::uuid
$$;

-- Tabela locadora (como na 0001, com as colunas que a 0002 e a 0003 não mudaram)
CREATE TABLE locadora (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social         text NOT NULL,
  nome_fantasia        text NOT NULL,
  cnpj                 text NOT NULL UNIQUE,
  email                citext NOT NULL,
  telefone             text,
  status               status_locadora NOT NULL DEFAULT 'PENDENTE',
  comissao_percentual  numeric(5,2),
  conta_recebimento_id text,
  documentos_exigidos  text[] NOT NULL DEFAULT '{}',
  regras_caucao        jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em            timestamptz NOT NULL DEFAULT now(),
  atualizado_em        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT locadora_cnpj_formato CHECK (cnpj ~ '^[0-9]{14}$'),
  CONSTRAINT locadora_comissao_faixa
    CHECK (comissao_percentual IS NULL OR comissao_percentual BETWEEN 0 AND 100),
  CONSTRAINT locadora_regras_caucao_objeto CHECK (jsonb_typeof(regras_caucao) = 'object')
);

CREATE TRIGGER locadora_atualizado_em
  BEFORE UPDATE ON locadora
  FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();

CREATE FUNCTION locadora_protege_campos() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF sessao_perfil() IS NOT NULL AND sessao_perfil() <> 'ADMIN_PLATAFORMA' THEN
    IF NEW.cnpj IS DISTINCT FROM OLD.cnpj
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.comissao_percentual IS DISTINCT FROM OLD.comissao_percentual
       OR NEW.conta_recebimento_id IS DISTINCT FROM OLD.conta_recebimento_id THEN
      RAISE EXCEPTION 'apenas a administração da plataforma altera CNPJ, status, comissão ou conta de recebimento'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER locadora_protege_campos
  BEFORE UPDATE ON locadora
  FOR EACH ROW EXECUTE FUNCTION locadora_protege_campos();

COMMENT ON TABLE locadora IS 'Empresas que alugam bicicletas pelo aplicativo. É a raiz do isolamento de dados (multilocação).';

INSERT INTO locadora (razao_social, nome_fantasia, cnpj, email, telefone, status, documentos_exigidos, conta_recebimento_id)
SELECT razao_social, nome_fantasia, cnpj, email, telefone, 'ATIVA', documentos_exigidos, conta_recebimento_id
FROM empresa;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM locadora)
     AND (EXISTS (SELECT 1 FROM ponto) OR EXISTS (SELECT 1 FROM usuario WHERE perfil = 'OPERADOR')) THEN
    RAISE EXCEPTION 'Não dá para reverter a 0004: há pontos ou operadores, mas nenhuma empresa para virar a locadora.';
  END IF;
END
$$;

-- Funções e views de segurança por locadora (como nas 0002 e 0003)
CREATE FUNCTION locadora_esta_ativa(p_locadora_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM locadora WHERE id = p_locadora_id AND status = 'ATIVA')
$$;

-- Políticas e views novas saem; as antigas voltam
DROP POLICY ponto_publico ON ponto;
DROP POLICY ponto_equipe_le ON ponto;
DROP POLICY ponto_admin_escreve ON ponto;
DROP POLICY empresa_admin ON empresa;
DROP VIEW empresa_publica;

-- ponto: volta o vínculo com a locadora
ALTER TABLE usuario DROP CONSTRAINT usuario_ponto_fk;
ALTER TABLE ponto DROP CONSTRAINT ponto_nome_unico;
ALTER TABLE ponto ADD COLUMN locadora_id uuid REFERENCES locadora (id) ON DELETE RESTRICT;
UPDATE ponto SET locadora_id = (SELECT id FROM locadora LIMIT 1);
ALTER TABLE ponto ALTER COLUMN locadora_id SET NOT NULL;

-- a localização volta a ser obrigatória; pontos sem ela recebem um ponto central de São Luís
UPDATE ponto SET localizacao = ST_SetSRID(ST_MakePoint(-44.3028, -2.5297), 4326)::geography
WHERE localizacao IS NULL;
ALTER TABLE ponto ALTER COLUMN localizacao SET NOT NULL;

ALTER TABLE ponto ADD CONSTRAINT ponto_nome_por_locadora UNIQUE (locadora_id, nome);
ALTER TABLE ponto ADD CONSTRAINT ponto_id_locadora UNIQUE (id, locadora_id);
CREATE INDEX ponto_locadora_idx ON ponto (locadora_id);

-- usuario: volta locadora_id, nivel_acesso e os perfis antigos
ALTER TABLE usuario DROP CONSTRAINT usuario_ponto_so_operador;
ALTER TABLE usuario DROP CONSTRAINT usuario_dados_cliente;
ALTER TABLE usuario DROP COLUMN experiencia;
ALTER TABLE usuario DROP COLUMN atividade_preferida;

ALTER TYPE perfil_usuario RENAME TO perfil_usuario_novo;
CREATE TYPE perfil_usuario AS ENUM ('CLIENTE', 'OPERADOR', 'GERENTE_LOCADORA', 'ADMIN_PLATAFORMA');
ALTER TABLE usuario
  ALTER COLUMN perfil TYPE perfil_usuario
  USING (CASE perfil::text WHEN 'ADMIN' THEN 'ADMIN_PLATAFORMA' ELSE perfil::text END)::perfil_usuario;
DROP TYPE perfil_usuario_novo;

ALTER TABLE usuario ADD COLUMN locadora_id uuid REFERENCES locadora (id) ON DELETE RESTRICT;
ALTER TABLE usuario ADD COLUMN nivel_acesso nivel_acesso;
UPDATE usuario SET locadora_id = (SELECT id FROM locadora LIMIT 1) WHERE perfil = 'OPERADOR';
UPDATE usuario SET nivel_acesso = 'TOTAL' WHERE perfil = 'ADMIN_PLATAFORMA';

CREATE INDEX usuario_locadora_idx ON usuario (locadora_id) WHERE locadora_id IS NOT NULL;

ALTER TABLE usuario ADD CONSTRAINT usuario_ponto_da_locadora
  FOREIGN KEY (ponto_id, locadora_id) REFERENCES ponto (id, locadora_id);
ALTER TABLE usuario ADD CONSTRAINT usuario_vinculo_locadora
  CHECK ((perfil IN ('OPERADOR', 'GERENTE_LOCADORA')) = (locadora_id IS NOT NULL));
ALTER TABLE usuario ADD CONSTRAINT usuario_ponto_exige_locadora
  CHECK (ponto_id IS NULL OR locadora_id IS NOT NULL);
ALTER TABLE usuario ADD CONSTRAINT usuario_nivel_acesso_admin
  CHECK ((perfil = 'ADMIN_PLATAFORMA') = (nivel_acesso IS NOT NULL));
ALTER TABLE usuario ADD CONSTRAINT usuario_dados_cliente CHECK (
  (perfil = 'CLIENTE'
     AND cpf IS NOT NULL
     AND aceite_termos_em IS NOT NULL
     AND versao_termos IS NOT NULL)
  OR
  (perfil <> 'CLIENTE'
     AND cpf IS NULL
     AND data_nascimento IS NULL
     AND altura_cm IS NULL
     AND documento_chave IS NULL
     AND aceite_termos_em IS NULL
     AND versao_termos IS NULL)
);

COMMENT ON COLUMN usuario.altura_cm IS NULL;

-- RLS do modelo anterior (0001, 0002 e 0003)
ALTER TABLE locadora ENABLE ROW LEVEL SECURITY;

CREATE POLICY locadora_admin ON locadora
  USING (sessao_perfil() = 'ADMIN_PLATAFORMA')
  WITH CHECK (sessao_perfil() = 'ADMIN_PLATAFORMA');

CREATE POLICY locadora_gerente_le ON locadora FOR SELECT
  USING (id = sessao_locadora_id() AND sessao_perfil() = 'GERENTE_LOCADORA');

CREATE POLICY locadora_gerente_edita ON locadora FOR UPDATE
  USING (id = sessao_locadora_id() AND sessao_perfil() = 'GERENTE_LOCADORA')
  WITH CHECK (id = sessao_locadora_id() AND sessao_perfil() = 'GERENTE_LOCADORA');

CREATE POLICY ponto_admin ON ponto
  USING (sessao_perfil() = 'ADMIN_PLATAFORMA')
  WITH CHECK (sessao_perfil() = 'ADMIN_PLATAFORMA');

CREATE POLICY ponto_publico ON ponto FOR SELECT
  USING (ativo AND locadora_esta_ativa(locadora_id));

CREATE POLICY ponto_equipe_le ON ponto FOR SELECT
  USING (locadora_id = sessao_locadora_id());

CREATE POLICY ponto_gerente_escreve ON ponto
  USING (locadora_id = sessao_locadora_id() AND sessao_perfil() = 'GERENTE_LOCADORA')
  WITH CHECK (locadora_id = sessao_locadora_id() AND sessao_perfil() = 'GERENTE_LOCADORA');

CREATE VIEW locadora_catalogo WITH (security_barrier = true) AS
  SELECT id, nome_fantasia, telefone, documentos_exigidos, regras_caucao
  FROM locadora
  WHERE status = 'ATIVA';

CREATE VIEW locadora_equipe WITH (security_barrier = true) AS
  SELECT id, razao_social, nome_fantasia, email, telefone, status,
         documentos_exigidos, regras_caucao
  FROM locadora
  WHERE id = sessao_locadora_id()
    AND sessao_perfil() IN ('OPERADOR', 'GERENTE_LOCADORA');

GRANT SELECT, INSERT, UPDATE ON locadora TO app_backend;
GRANT SELECT ON locadora_catalogo, locadora_equipe TO app_backend;

-- Sai o que a 0004 criou
DROP FUNCTION sessao_usuario_id();
DROP TABLE empresa;
DROP TYPE atividade;
DROP TYPE experiencia;
