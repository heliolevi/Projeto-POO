-- migrate:up

-- ---------------------------------------------------------------------------
-- Catálogo: tipos de bicicleta e unidades da frota (docs/modelo-de-dados.md)
--
-- tipo_bicicleta é o "modelo" que o cliente escolhe, e traz tudo o que a recomendação precisa
-- saber: faixa de altura, atividades, nível recomendado, preços e caução.
-- bicicleta é a unidade física, com o número que a locadora cola nela.
-- ---------------------------------------------------------------------------
CREATE TYPE status_bicicleta AS ENUM ('DISPONIVEL', 'ALUGADA', 'MANUTENCAO', 'BLOQUEADA', 'BAIXADA');

CREATE TABLE tipo_bicicleta (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                 text NOT NULL,
  descricao            text,
  atividades           atividade[] NOT NULL,
  altura_min_cm        smallint NOT NULL,
  altura_max_cm        smallint NOT NULL,
  nivel_recomendado    experiencia NOT NULL DEFAULT 'INICIANTE',
  preco_hora_centavos  integer NOT NULL,
  preco_dia_centavos   integer NOT NULL,
  valor_caucao_centavos integer NOT NULL DEFAULT 0,
  ativo                boolean NOT NULL DEFAULT true,
  criado_em            timestamptz NOT NULL DEFAULT now(),
  atualizado_em        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tipo_bicicleta_nome_unico UNIQUE (nome),
  CONSTRAINT tipo_bicicleta_altura_faixa
    CHECK (altura_min_cm BETWEEN 100 AND 250 AND altura_max_cm BETWEEN 100 AND 250),
  CONSTRAINT tipo_bicicleta_altura_ordem CHECK (altura_min_cm <= altura_max_cm),
  CONSTRAINT tipo_bicicleta_atividades_nao_vazia CHECK (cardinality(atividades) > 0),
  -- dinheiro sempre em centavos inteiros
  CONSTRAINT tipo_bicicleta_precos_validos
    CHECK (preco_hora_centavos >= 0 AND preco_dia_centavos >= 0 AND valor_caucao_centavos >= 0)
);

CREATE TRIGGER tipo_bicicleta_atualizado_em
  BEFORE UPDATE ON tipo_bicicleta
  FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();

COMMENT ON TABLE tipo_bicicleta IS 'Um modelo do catálogo. É o que o cliente reserva; o sistema escolhe a unidade livre.';
COMMENT ON COLUMN tipo_bicicleta.atividades IS 'Para o que o tipo é indicado (um ou mais valores de atividade).';
COMMENT ON COLUMN tipo_bicicleta.altura_min_cm IS 'Menor altura do ciclista para a qual o tipo serve.';
COMMENT ON COLUMN tipo_bicicleta.altura_max_cm IS 'Maior altura do ciclista para a qual o tipo serve.';
COMMENT ON COLUMN tipo_bicicleta.nivel_recomendado IS 'Experiência a partir da qual o tipo é confortável.';
COMMENT ON COLUMN tipo_bicicleta.preco_hora_centavos IS 'Em centavos inteiros (nunca ponto flutuante).';

CREATE TABLE bicicleta (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_id        uuid NOT NULL REFERENCES tipo_bicicleta (id) ON DELETE RESTRICT,
  ponto_id       uuid NOT NULL REFERENCES ponto (id) ON DELETE RESTRICT,
  codigo         text NOT NULL,
  numero_serie   text,
  tamanho_quadro text,
  status         status_bicicleta NOT NULL DEFAULT 'DISPONIVEL',
  observacoes    text,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bicicleta_codigo_unico UNIQUE (codigo)
);

-- a busca por disponibilidade filtra por tipo e status
CREATE INDEX bicicleta_tipo_status_idx ON bicicleta (tipo_id, status);
CREATE INDEX bicicleta_ponto_idx ON bicicleta (ponto_id);

CREATE TRIGGER bicicleta_atualizado_em
  BEFORE UPDATE ON bicicleta
  FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em();

COMMENT ON TABLE bicicleta IS 'Uma unidade física da frota. Só pode ser reservada quando o status é DISPONIVEL.';
COMMENT ON COLUMN bicicleta.codigo IS 'Número que a locadora cola na bicicleta. Único.';
COMMENT ON COLUMN bicicleta.status IS 'No MVP a disponibilidade vem das reservas; aqui só se marca MANUTENCAO, BLOQUEADA ou BAIXADA.';

-- ---------------------------------------------------------------------------
-- Segurança por linha
--
-- tipo_bicicleta: o visitante lê só os tipos ativos; OPERADOR e ADMIN leem tudo e escrevem.
-- bicicleta: RLS filtra linhas e não colunas, e a unidade tem dados internos (número de série,
-- observações). Por isso a tabela é só da equipe, e a busca de disponibilidade usa a view
-- bicicleta_livre, que mostra apenas o necessário das unidades disponíveis.
-- ---------------------------------------------------------------------------
ALTER TABLE tipo_bicicleta ENABLE ROW LEVEL SECURITY;
ALTER TABLE bicicleta      ENABLE ROW LEVEL SECURITY;

CREATE POLICY tipo_bicicleta_publico ON tipo_bicicleta FOR SELECT
  USING (ativo);

CREATE POLICY tipo_bicicleta_equipe ON tipo_bicicleta
  USING (sessao_perfil() IN ('OPERADOR', 'ADMIN'))
  WITH CHECK (sessao_perfil() IN ('OPERADOR', 'ADMIN'));

CREATE POLICY bicicleta_equipe ON bicicleta
  USING (sessao_perfil() IN ('OPERADOR', 'ADMIN'))
  WITH CHECK (sessao_perfil() IN ('OPERADOR', 'ADMIN'));

-- Roda com os direitos de quem criou a view (por isso o filtro está nela); security_barrier
-- impede que condições de quem consulta rodem antes do filtro de status e de tipo ativo.
CREATE VIEW bicicleta_livre WITH (security_barrier = true) AS
  SELECT b.id, b.tipo_id, b.ponto_id, b.tamanho_quadro
  FROM bicicleta b
  JOIN tipo_bicicleta t ON t.id = b.tipo_id
  WHERE b.status = 'DISPONIVEL'
    AND t.ativo;

COMMENT ON VIEW bicicleta_livre IS 'Unidades com status DISPONIVEL de tipos ativos, sem dados internos. Ainda não descontam as reservas: quem busca disponibilidade cruza com a tabela de reservas.';

-- ---------------------------------------------------------------------------
-- Permissões do papel do aplicativo (app_backend)
-- Sem DELETE: um tipo sai do catálogo com ativo = false, e uma unidade com status BAIXADA.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON tipo_bicicleta, bicicleta TO app_backend;
GRANT SELECT ON bicicleta_livre TO app_backend;

-- migrate:down

DROP VIEW IF EXISTS bicicleta_livre;
DROP TABLE IF EXISTS bicicleta;
DROP TABLE IF EXISTS tipo_bicicleta;
DROP TYPE IF EXISTS status_bicicleta;
