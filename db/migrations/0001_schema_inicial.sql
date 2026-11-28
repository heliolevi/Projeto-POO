-- migrate:up

-- ---------------------------------------------------------------------------
-- Extensões
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;     -- localização dos pontos e busca por proximidade
CREATE EXTENSION IF NOT EXISTS citext;      -- e-mail sem diferenciar maiúsculas de minúsculas
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- será usada na constraint de reservas sobrepostas

-- ---------------------------------------------------------------------------
-- Tipos enumerados
-- ---------------------------------------------------------------------------
CREATE TYPE perfil_usuario AS ENUM ('CLIENTE', 'OPERADOR', 'GERENTE_LOCADORA', 'ADMIN_PLATAFORMA');
CREATE TYPE nivel_acesso   AS ENUM ('SUPORTE', 'FINANCEIRO', 'TOTAL');
CREATE TYPE status_locadora AS ENUM ('PENDENTE', 'ATIVA', 'SUSPENSA', 'INATIVA');

-- ---------------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------------

-- Mantém atualizado_em em dia a cada UPDATE.
CREATE FUNCTION definir_atualizado_em() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

-- O backend informa quem está logado no começo de cada transação:
--   SELECT set_config('app.perfil', 'GERENTE_LOCADORA', true),
--          set_config('app.locadora_id', '<uuid>', true);
-- As políticas de row-level security leem esses valores.
CREATE FUNCTION sessao_perfil() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.perfil', true), '')
$$;

CREATE FUNCTION sessao_locadora_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.locadora_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- locadora
-- ---------------------------------------------------------------------------
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

-- Com a sessão de uma locadora, só a plataforma mexe em dados que envolvem dinheiro
-- ou aprovação. Conexões sem perfil (migrations, rotinas internas) não são afetadas.
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
COMMENT ON COLUMN locadora.cnpj IS 'Somente dígitos, 14 posições.';
COMMENT ON COLUMN locadora.comissao_percentual IS 'Percentual retido pela plataforma. Nulo até o modelo de comissão ser definido.';
COMMENT ON COLUMN locadora.conta_recebimento_id IS 'Identificador da conta da locadora no Mercado Pago, usado no repasse.';
COMMENT ON COLUMN locadora.documentos_exigidos IS 'Documentos que o cliente precisa apresentar na retirada.';
COMMENT ON COLUMN locadora.regras_caucao IS 'Regras de caução da locadora (objeto JSON).';

-- ---------------------------------------------------------------------------
-- ponto (retirada e devolução)
-- ---------------------------------------------------------------------------
CREATE TABLE ponto (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locadora_id   uuid NOT NULL REFERENCES locadora (id) ON DELETE RESTRICT,
  nome          text NOT NULL,
  logradouro    text NOT NULL,
  numero        text NOT NULL,
  complemento   text,
  bairro        text NOT NULL,
  cep           text NOT NULL,
  cidade        text NOT NULL DEFAULT 'São Luís',
  uf            char(2) NOT NULL DEFAULT 'MA',
  localizacao   geography(Point, 4326) NOT NULL,
  telefone      text,
  horarios      jsonb NOT NULL DEFAULT '[]'::jsonb,
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ponto_nome_por_locadora UNIQUE (locadora_id, nome),
  -- permite que outras tabelas apontem para (ponto, locadora) e garantam que os dois combinam
  CONSTRAINT ponto_id_locadora UNIQUE (id, locadora_id),
  CONSTRAINT ponto_cep_formato CHECK (cep ~ '^[0-9]{8}$'),
  CONSTRAINT ponto_uf_formato CHECK (uf ~ '^[A-Z]{2}$'),
  CONSTRAINT ponto_horarios_lista CHECK (jsonb_typeof(horarios) = 'array')
);

CREATE INDEX ponto_locadora_idx ON ponto (locadora_id);
CREATE INDEX ponto_localizacao_gix ON ponto USING gist (localizacao);

CREATE TRIGGER ponto_atualizado_em
  BEFORE UPDATE ON ponto
  FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();

COMMENT ON TABLE ponto IS 'Local de retirada e devolução de uma locadora.';
COMMENT ON COLUMN ponto.localizacao IS 'Coordenadas WGS 84 (SRID 4326). Use ST_MakePoint(longitude, latitude).';
COMMENT ON COLUMN ponto.horarios IS 'Lista JSON de {dia_semana, abre, fecha}.';

-- ---------------------------------------------------------------------------
-- usuario (clientes, equipe das locadoras e administradores da plataforma)
-- ---------------------------------------------------------------------------
CREATE TABLE usuario (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil           perfil_usuario NOT NULL,
  nome             text NOT NULL,
  email            citext NOT NULL UNIQUE,
  senha_hash       text NOT NULL,
  telefone         text,
  ativo            boolean NOT NULL DEFAULT true,

  -- equipe da locadora (OPERADOR e GERENTE_LOCADORA)
  locadora_id      uuid REFERENCES locadora (id) ON DELETE RESTRICT,
  ponto_id         uuid,

  -- administradores da plataforma
  nivel_acesso     nivel_acesso,

  -- clientes
  cpf              text UNIQUE,
  data_nascimento  date,
  altura_cm        smallint,
  documento_chave  text,
  aceite_termos_em timestamptz,
  versao_termos    text,

  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),

  -- o ponto precisa pertencer à mesma locadora do usuário
  CONSTRAINT usuario_ponto_da_locadora
    FOREIGN KEY (ponto_id, locadora_id) REFERENCES ponto (id, locadora_id),

  CONSTRAINT usuario_email_formato CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  CONSTRAINT usuario_cpf_formato CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$'),
  CONSTRAINT usuario_altura_faixa CHECK (altura_cm IS NULL OR altura_cm BETWEEN 100 AND 250),

  -- só a equipe da locadora tem locadora_id; os demais não
  CONSTRAINT usuario_vinculo_locadora
    CHECK ((perfil IN ('OPERADOR', 'GERENTE_LOCADORA')) = (locadora_id IS NOT NULL)),
  CONSTRAINT usuario_ponto_exige_locadora
    CHECK (ponto_id IS NULL OR locadora_id IS NOT NULL),
  CONSTRAINT usuario_nivel_acesso_admin
    CHECK ((perfil = 'ADMIN_PLATAFORMA') = (nivel_acesso IS NOT NULL)),

  -- cliente: CPF e aceite dos termos obrigatórios (o documento pode ser enviado depois);
  -- os demais perfis não guardam dados de cliente
  CONSTRAINT usuario_dados_cliente CHECK (
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
  )
);

CREATE INDEX usuario_locadora_idx ON usuario (locadora_id) WHERE locadora_id IS NOT NULL;

CREATE TRIGGER usuario_atualizado_em
  BEFORE UPDATE ON usuario
  FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();

COMMENT ON TABLE usuario IS 'Todos os perfis de acesso em uma só tabela; as constraints garantem os campos de cada perfil.';
COMMENT ON COLUMN usuario.senha_hash IS 'Hash da senha (nunca a senha).';
COMMENT ON COLUMN usuario.cpf IS 'Dado pessoal (LGPD). Somente dígitos, 11 posições.';
COMMENT ON COLUMN usuario.documento_chave IS 'Chave do arquivo no armazenamento privado. O arquivo é acessado por URL temporária.';

-- ---------------------------------------------------------------------------
-- Row-level security (multilocação)
--
-- As políticas valem para papéis sem BYPASSRLS. O backend deve conectar com um
-- papel próprio, e não com o dono do banco, para elas serem aplicadas.
-- usuario ainda não tem política: o login consulta a tabela antes de existir
-- uma sessão, então isso fica para o módulo de contas.
-- ---------------------------------------------------------------------------
ALTER TABLE locadora ENABLE ROW LEVEL SECURITY;
ALTER TABLE ponto    ENABLE ROW LEVEL SECURITY;

-- locadora
CREATE POLICY locadora_admin ON locadora
  USING (sessao_perfil() = 'ADMIN_PLATAFORMA')
  WITH CHECK (sessao_perfil() = 'ADMIN_PLATAFORMA');

CREATE POLICY locadora_publica ON locadora FOR SELECT
  USING (status = 'ATIVA');

CREATE POLICY locadora_equipe_le ON locadora FOR SELECT
  USING (id = sessao_locadora_id());

CREATE POLICY locadora_gerente_edita ON locadora FOR UPDATE
  USING (id = sessao_locadora_id() AND sessao_perfil() = 'GERENTE_LOCADORA')
  WITH CHECK (id = sessao_locadora_id() AND sessao_perfil() = 'GERENTE_LOCADORA');

-- ponto
CREATE POLICY ponto_admin ON ponto
  USING (sessao_perfil() = 'ADMIN_PLATAFORMA')
  WITH CHECK (sessao_perfil() = 'ADMIN_PLATAFORMA');

CREATE POLICY ponto_publico ON ponto FOR SELECT
  USING (
    ativo
    AND EXISTS (SELECT 1 FROM locadora l WHERE l.id = ponto.locadora_id AND l.status = 'ATIVA')
  );

CREATE POLICY ponto_equipe_le ON ponto FOR SELECT
  USING (locadora_id = sessao_locadora_id());

CREATE POLICY ponto_gerente_escreve ON ponto
  USING (locadora_id = sessao_locadora_id() AND sessao_perfil() = 'GERENTE_LOCADORA')
  WITH CHECK (locadora_id = sessao_locadora_id() AND sessao_perfil() = 'GERENTE_LOCADORA');

-- migrate:down

DROP TABLE IF EXISTS usuario;
DROP TABLE IF EXISTS ponto;
DROP TABLE IF EXISTS locadora;

DROP FUNCTION IF EXISTS locadora_protege_campos();
DROP FUNCTION IF EXISTS sessao_locadora_id();
DROP FUNCTION IF EXISTS sessao_perfil();
DROP FUNCTION IF EXISTS definir_atualizado_em();

DROP TYPE IF EXISTS status_locadora;
DROP TYPE IF EXISTS nivel_acesso;
DROP TYPE IF EXISTS perfil_usuario;

-- As extensões ficam: já estavam habilitadas antes e as próximas migrations dependem delas.
