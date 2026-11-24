-- 0020: alergênicos calculados da ficha técnica (S1; RC-07; decisão 0026). Só adiciona.
-- É informação de SAÚDE do cliente: na dúvida o sistema nunca diz "não contém", diz "em conferência".
-- O ingrediente é marcado uma vez (contém / pode conter traços); o prato herda pela ficha técnica.

-- Catálogo de alergênicos, editável pela equipe (desativa em vez de apagar, RC-17).
-- Lista inicial = HIPÓTESE a confirmar com o responsável e um nutricionista: os grupos de
-- alergênicos da RDC 26/2015 da Anvisa (rotulagem de alimentos alergênicos) e, para a lactose, a
-- RDC 136/2017. Nenhuma outra regra da Anvisa foi aplicada aqui.
CREATE TABLE alergenico (
  -- Código estável (só letras minúsculas e _): é ele que fica gravado no ingrediente.
  codigo        text PRIMARY KEY CHECK (codigo ~ '^[a-z][a-z_]{1,39}$'),
  nome          text NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 60 AND nome !~ '[[:cntrl:]]'),
  descricao     text CHECK (length(btrim(descricao)) BETWEEN 1 AND 300 AND descricao !~ '[[:cntrl:]]'),
  ordem         integer NOT NULL DEFAULT 0 CHECK (ordem BETWEEN 0 AND 9999),
  ativo         boolean NOT NULL DEFAULT true,
  -- Desde quando está na lista (criado ou reativado). Ingrediente conferido ANTES disso não está
  -- conferido para este alergênico: o prato volta a "em conferência" (decisão 0026).
  na_lista_desde timestamptz NOT NULL DEFAULT clock_timestamp(),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX alergenico_nome ON alergenico (lower(btrim(nome)));

-- A lista inicial nasce "desde sempre": a conferência de qualquer ingrediente já a cobre.
INSERT INTO alergenico (codigo, nome, descricao, ordem, na_lista_desde) SELECT c, n, d, o, timestamptz '2000-01-01 00:00:00+00' FROM (VALUES
  ('gluten',     'Glúten',             'Trigo, centeio, cevada, aveia e derivados.', 10),
  ('crustaceos', 'Crustáceos',         'Camarão, lagosta, caranguejo, siri e derivados.', 20),
  ('ovos',       'Ovos',               'Ovos e derivados.', 30),
  ('peixes',     'Peixes',             'Peixes e derivados.', 40),
  ('amendoim',   'Amendoim',           'Amendoim e derivados.', 50),
  ('soja',       'Soja',               'Soja e derivados.', 60),
  ('leite',      'Leite',              'Leite de todos os mamíferos e derivados.', 70),
  ('castanhas',  'Castanhas e nozes',  'Amêndoa, avelã, castanha-de-caju, castanha-do-pará, macadâmia, nozes, pecã, pistache, pinoli e derivados.', 80),
  ('latex',      'Látex natural',      'Látex natural e derivados.', 90),
  ('lactose',    'Lactose',            'Açúcar do leite (para quem tem intolerância).', 100)) AS v (c, n, d, o);

-- O que cada ingrediente contém ou pode conter em traços. Sem linha ativa = não contém aquele.
-- Desmarcar não apaga (o papel do aplicativo não tem DELETE, RC-17): a linha fica inativa.
CREATE TABLE ingrediente_alergenico (
  ingrediente_id    integer NOT NULL REFERENCES ingrediente (id),
  alergenico_codigo text NOT NULL REFERENCES alergenico (codigo),
  tipo              text NOT NULL CHECK (tipo IN ('contem', 'tracos')),
  ativo             boolean NOT NULL DEFAULT true,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ingrediente_id, alergenico_codigo)
);
CREATE INDEX ingrediente_alergenico_codigo ON ingrediente_alergenico (alergenico_codigo) WHERE ativo;

-- Quem conferiu e quando. Nulo = ainda não conferido (o prato fica "em conferência").
-- Conferido sem nenhuma linha ativa = "não contém nenhum".
ALTER TABLE ingrediente
  ADD COLUMN alergenicos_conferidos_em timestamptz,
  ADD COLUMN alergenicos_conferidos_por integer REFERENCES usuario (id),
  ADD CONSTRAINT ingrediente_alergenicos_conferidos CHECK (
    (alergenicos_conferidos_em IS NULL) = (alergenicos_conferidos_por IS NULL));
