-- Dados de exemplo para o ambiente de DESENVOLVIMENTO. Não faz parte das migrations.
--
-- Pode rodar várias vezes: cada linha usa ON CONFLICT e é atualizada em vez de duplicada.
-- NUNCA rode em production. Para aplicar, use `npm run seed:dev` dentro de db/ (veja db/README.md).
--
-- As senhas da equipe NÃO ficam neste arquivo. O script aplicar-seed.mjs gera o hash a partir de
-- SEED_ADMIN_SENHA e SEED_OPERADOR_SENHA (do .env.local) e entrega ao banco nas configurações
-- seed.hash_admin e seed.hash_operador, que este arquivo lê. Os dados da empresa e do ponto são
-- fictícios, até a locadora real ser definida (docs/dados-da-locadora.md).

-- Falha com uma mensagem clara se os hashes não vieram (por exemplo, rodando o arquivo direto no psql).
DO $$
BEGIN
  IF coalesce(current_setting('seed.hash_admin', true), '') = ''
     OR coalesce(current_setting('seed.hash_operador', true), '') = '' THEN
    RAISE EXCEPTION 'Defina seed.hash_admin e seed.hash_operador. Use "npm run seed:dev" em db/, que gera os hashes.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Empresa (uma linha só) e ponto de retirada
-- ---------------------------------------------------------------------------
INSERT INTO empresa (id, razao_social, nome_fantasia, cnpj, email, telefone, documentos_exigidos)
VALUES (
  true,
  'Bike Ilha Club Locação de Bicicletas Ltda (exemplo)',
  'Bike Ilha Club',
  '12345678000195',
  'contato@bikeilha.test',
  '98900000000',
  ARRAY['Documento de identidade com foto', 'CPF']
)
ON CONFLICT (id) DO UPDATE SET
  razao_social        = EXCLUDED.razao_social,
  nome_fantasia       = EXCLUDED.nome_fantasia,
  cnpj                = EXCLUDED.cnpj,
  email               = EXCLUDED.email,
  telefone            = EXCLUDED.telefone,
  documentos_exigidos = EXCLUDED.documentos_exigidos;

INSERT INTO ponto (nome, logradouro, numero, bairro, cep, cidade, uf, localizacao, telefone, horarios, ativo)
VALUES (
  'Ponto Litorânea',
  'Avenida Litorânea',
  '100',
  'Calhau',
  '65000000',
  'São Luís',
  'MA',
  ST_SetSRID(ST_MakePoint(-44.2200, -2.4900), 4326)::geography,
  '98900000000',
  '[
    {"dia_semana": 0, "abre": "08:00", "fecha": "14:00"},
    {"dia_semana": 1, "abre": "08:00", "fecha": "18:00"},
    {"dia_semana": 2, "abre": "08:00", "fecha": "18:00"},
    {"dia_semana": 3, "abre": "08:00", "fecha": "18:00"},
    {"dia_semana": 4, "abre": "08:00", "fecha": "18:00"},
    {"dia_semana": 5, "abre": "08:00", "fecha": "18:00"},
    {"dia_semana": 6, "abre": "08:00", "fecha": "16:00"}
  ]'::jsonb,
  true
)
ON CONFLICT (nome) DO UPDATE SET
  logradouro  = EXCLUDED.logradouro,
  numero      = EXCLUDED.numero,
  bairro      = EXCLUDED.bairro,
  cep         = EXCLUDED.cep,
  cidade      = EXCLUDED.cidade,
  uf          = EXCLUDED.uf,
  localizacao = EXCLUDED.localizacao,
  telefone    = EXCLUDED.telefone,
  horarios    = EXCLUDED.horarios,
  ativo       = EXCLUDED.ativo;

-- ---------------------------------------------------------------------------
-- Seis tipos de bicicleta (preços em centavos)
-- As faixas de altura se sobrepõem de propósito, para a recomendação ter o que ordenar.
-- ---------------------------------------------------------------------------
INSERT INTO tipo_bicicleta
  (nome, descricao, atividades, altura_min_cm, altura_max_cm, nivel_recomendado,
   preco_hora_centavos, preco_dia_centavos, valor_caucao_centavos)
VALUES
  ('Urbana',
   'Leve e prática para o dia a dia na cidade.',
   ARRAY['URBANO', 'PASSEIO']::atividade[], 150, 195, 'INICIANTE', 1000, 5000, 15000),
  ('Passeio',
   'Confortável, com posição ereta, ideal para a orla e passeios tranquilos.',
   ARRAY['PASSEIO', 'TURISMO']::atividade[], 145, 190, 'INICIANTE', 1200, 6000, 15000),
  ('Mountain bike',
   'Suspensão e pneus largos para trilhas e terrenos irregulares.',
   ARRAY['TRILHA', 'ESPORTE']::atividade[], 160, 200, 'INTERMEDIARIO', 2000, 10000, 30000),
  ('Speed',
   'Quadro leve e pneus finos para velocidade no asfalto.',
   ARRAY['ESPORTE', 'URBANO']::atividade[], 165, 200, 'AVANCADO', 2500, 12000, 40000),
  ('Elétrica',
   'Com motor de apoio, para percorrer mais distância com menos esforço.',
   ARRAY['TURISMO', 'URBANO', 'PASSEIO']::atividade[], 150, 200, 'INICIANTE', 3500, 18000, 60000),
  ('Infantil',
   'Tamanho reduzido para crianças.',
   ARRAY['PASSEIO']::atividade[], 100, 140, 'INICIANTE', 800, 4000, 10000)
ON CONFLICT (nome) DO UPDATE SET
  descricao             = EXCLUDED.descricao,
  atividades            = EXCLUDED.atividades,
  altura_min_cm         = EXCLUDED.altura_min_cm,
  altura_max_cm         = EXCLUDED.altura_max_cm,
  nivel_recomendado     = EXCLUDED.nivel_recomendado,
  preco_hora_centavos   = EXCLUDED.preco_hora_centavos,
  preco_dia_centavos    = EXCLUDED.preco_dia_centavos,
  valor_caucao_centavos = EXCLUDED.valor_caucao_centavos,
  ativo                 = true;

-- ---------------------------------------------------------------------------
-- Catorze bicicletas (unidades), todas no Ponto Litorânea
-- ---------------------------------------------------------------------------
INSERT INTO bicicleta (tipo_id, ponto_id, codigo, numero_serie, tamanho_quadro, status)
SELECT t.id, p.id, v.codigo, v.numero_serie, v.tamanho_quadro, 'DISPONIVEL'::status_bicicleta
FROM (VALUES
  ('Urbana',        'BIC-001', 'SN-URB-001', 'M'),
  ('Urbana',        'BIC-002', 'SN-URB-002', 'M'),
  ('Urbana',        'BIC-003', 'SN-URB-003', 'G'),
  ('Passeio',       'BIC-004', 'SN-PAS-001', 'M'),
  ('Passeio',       'BIC-005', 'SN-PAS-002', 'M'),
  ('Passeio',       'BIC-006', 'SN-PAS-003', 'G'),
  ('Mountain bike', 'BIC-007', 'SN-MTB-001', 'M'),
  ('Mountain bike', 'BIC-008', 'SN-MTB-002', 'G'),
  ('Mountain bike', 'BIC-009', 'SN-MTB-003', 'G'),
  ('Speed',         'BIC-010', 'SN-SPD-001', 'M'),
  ('Speed',         'BIC-011', 'SN-SPD-002', 'G'),
  ('Elétrica',      'BIC-012', 'SN-ELE-001', 'M'),
  ('Elétrica',      'BIC-013', 'SN-ELE-002', 'G'),
  ('Infantil',      'BIC-014', 'SN-INF-001', 'P')
) AS v (tipo, codigo, numero_serie, tamanho_quadro)
JOIN tipo_bicicleta t ON t.nome = v.tipo
CROSS JOIN ponto p
WHERE p.nome = 'Ponto Litorânea'
ON CONFLICT (codigo) DO UPDATE SET
  tipo_id        = EXCLUDED.tipo_id,
  ponto_id       = EXCLUDED.ponto_id,
  numero_serie   = EXCLUDED.numero_serie,
  tamanho_quadro = EXCLUDED.tamanho_quadro,
  status         = 'DISPONIVEL';

-- ---------------------------------------------------------------------------
-- Equipe: um ADMIN e um OPERADOR (a senha vem do ambiente local, nunca do Git)
-- Se o e-mail já existir, só a senha e o status ativo são reajustados.
-- ---------------------------------------------------------------------------
INSERT INTO usuario (perfil, nome, email, senha_hash, ativo)
VALUES ('ADMIN', 'Administrador de teste', 'admin@bikeilha.test', current_setting('seed.hash_admin'), true)
ON CONFLICT (email) DO UPDATE SET
  senha_hash = EXCLUDED.senha_hash,
  ativo      = true;

INSERT INTO usuario (perfil, nome, email, senha_hash, ativo, ponto_id)
SELECT 'OPERADOR', 'Operador de teste', 'operador@bikeilha.test', current_setting('seed.hash_operador'), true, p.id
FROM ponto p
WHERE p.nome = 'Ponto Litorânea'
ON CONFLICT (email) DO UPDATE SET
  senha_hash = EXCLUDED.senha_hash,
  ativo      = true;
