-- Produtos completos, parte 1 (passo 3 do plano de 19/11/2026; decisão 0021).
-- 1. Preço do delivery: o produto tem o preço da loja (preco_centavos) e, se for diferente, o do
--    delivery. Nulo = igual ao da loja (assim, "juntar no futuro" é só limpar a coluna).
-- 2. Tamanhos: cada produto pode ter tamanhos (P, M, G; 300 ml, 500 ml). O tamanho soma um
--    acréscimo ao preço do produto (0 no menor); o acréscimo do delivery, nulo = igual ao da loja.
--    Produto com tamanho ativo só se vende com um tamanho escolhido.
-- 3. Adicionais: grupos reutilizáveis ("Molhos", "Ponto da carne", "Turbine seu lanche") com
--    mínimo e máximo de escolhas; cada item tem preço (pode ser 0) e quantas vezes pode entrar
--    no mesmo item. O produto usa os grupos ligados a ele, na ordem escolhida.
-- Dinheiro em centavos inteiros. Nada se apaga: tamanho, item, grupo e ligação ficam inativos.

ALTER TABLE produto
  ADD COLUMN preco_delivery_centavos integer CHECK (preco_delivery_centavos BETWEEN 1 AND 999999);

CREATE TABLE produto_tamanho (
  id                          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  produto_id                  integer NOT NULL REFERENCES produto (id),
  nome                        text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 30 AND nome !~ '[[:cntrl:]]'),
  acrescimo_centavos          integer NOT NULL DEFAULT 0 CHECK (acrescimo_centavos BETWEEN 0 AND 999999),
  acrescimo_delivery_centavos integer CHECK (acrescimo_delivery_centavos BETWEEN 0 AND 999999),
  ordem                       integer NOT NULL DEFAULT 0 CHECK (ordem BETWEEN 0 AND 9999),
  ativo                       boolean NOT NULL DEFAULT true,
  criado_em                   timestamptz NOT NULL DEFAULT now(),
  atualizado_em               timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX produto_tamanho_nome ON produto_tamanho (produto_id, nome_de_unidade(nome)) WHERE ativo;
CREATE INDEX produto_tamanho_produto ON produto_tamanho (produto_id, ordem) WHERE ativo;

CREATE TABLE grupo_adicional (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome          text NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 40 AND nome !~ '[[:cntrl:]]'),
  -- Mínimo 0 = opcional; mínimo 1 ou mais = escolha obrigatória (ex.: ponto da carne).
  minimo        smallint NOT NULL DEFAULT 0 CHECK (minimo BETWEEN 0 AND 20),
  maximo        smallint NOT NULL DEFAULT 1 CHECK (maximo BETWEEN 1 AND 20),
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grupo_adicional_minimo_maximo CHECK (minimo <= maximo)
);
CREATE UNIQUE INDEX grupo_adicional_nome ON grupo_adicional (nome_de_unidade(nome)) WHERE ativo;

CREATE TABLE adicional (
  id                      integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grupo_id                integer NOT NULL REFERENCES grupo_adicional (id),
  nome                    text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 40 AND nome !~ '[[:cntrl:]]'),
  preco_centavos          integer NOT NULL DEFAULT 0 CHECK (preco_centavos BETWEEN 0 AND 999999),
  preco_delivery_centavos integer CHECK (preco_delivery_centavos BETWEEN 0 AND 999999),
  -- Quantas vezes o mesmo adicional entra num item (ex.: bacon extra até 3x).
  maximo_por_item         smallint NOT NULL DEFAULT 1 CHECK (maximo_por_item BETWEEN 1 AND 10),
  ordem                   integer NOT NULL DEFAULT 0 CHECK (ordem BETWEEN 0 AND 9999),
  ativo                   boolean NOT NULL DEFAULT true,
  criado_em               timestamptz NOT NULL DEFAULT now(),
  atualizado_em           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX adicional_nome ON adicional (grupo_id, nome_de_unidade(nome)) WHERE ativo;
CREATE INDEX adicional_grupo ON adicional (grupo_id, ordem) WHERE ativo;

-- Que grupos de adicionais cada produto oferece, e em que ordem.
CREATE TABLE produto_grupo_adicional (
  produto_id    integer NOT NULL REFERENCES produto (id),
  grupo_id      integer NOT NULL REFERENCES grupo_adicional (id),
  ordem         integer NOT NULL DEFAULT 0 CHECK (ordem BETWEEN 0 AND 9999),
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (produto_id, grupo_id)
);
CREATE INDEX produto_grupo_adicional_grupo ON produto_grupo_adicional (grupo_id) WHERE ativo;
