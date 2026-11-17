-- Tipos de produção (RC-10 seção 1; decisão 0017). Cada produto terá um tipo (PR 3 da E07
-- parte 2); as telas da cozinha (E14) serão filtros de tipos. Criar um tipo é configuração.
-- Área: onde o tipo é feito e de onde sai. Cozinha (andar de baixo, sai pelo elevador) ou
-- cafeteria (salão, sai no balcão). Capacidade: quantos itens o tipo faz ao mesmo tempo,
-- usada na estimativa de espera (RC-10 seção 7); o ajuste por turno vem na E14.
-- Nada se apaga: tipo que não se usa mais fica inativo.

CREATE TABLE tipo_producao (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome          text NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 40 AND nome !~ '[[:cntrl:]]'),
  area          text NOT NULL CHECK (area IN ('cozinha', 'cafeteria')),
  capacidade    smallint NOT NULL DEFAULT 1 CHECK (capacidade BETWEEN 1 AND 50),
  -- Ordem em que aparece nas listas e nas telas (menor primeiro).
  ordem         integer NOT NULL DEFAULT 0 CHECK (ordem BETWEEN 0 AND 9999),
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tipo_producao_nome ON tipo_producao (nome_de_unidade(nome)) WHERE ativo;

-- As telas por tipo do RC-10 (Hambúrgueres; Pratos e grelhados) e a cafeteria, para não
-- começar vazio. Capacidade 1 é hipótese (decisão 0017); tudo editável.
INSERT INTO tipo_producao (nome, area, ordem) VALUES
  ('Hambúrgueres', 'cozinha', 10), ('Pratos e grelhados', 'cozinha', 20), ('Cafeteria', 'cafeteria', 30);
