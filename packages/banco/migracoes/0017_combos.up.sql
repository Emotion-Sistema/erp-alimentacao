-- Combos (passo 3 do plano de 19/11/2026; decisão 0023).
-- Um combo é um produto (categoria, preço da loja e do delivery, foto, adicionais) marcado como
-- combo e montado por PARTES ("Lanche", "Bebida", "Acompanhamento"). Em cada parte o cliente
-- escolhe UMA opção, e cada opção é um produto do cardápio (com tamanho fixo, se o produto tiver
-- tamanhos) que pode somar um acréscimo (ex.: trocar refrigerante por suco, + R$ 3,00).
-- O combo não passa pela produção como um todo: cada produto escolhido vai para a tela do seu tipo
-- (RC-01, na E11). Por isso o combo não tem tipo de produção nem tamanho.
-- Dinheiro em centavos inteiros. Nada se apaga: parte e opção que saem ficam inativas.

ALTER TABLE produto ADD COLUMN combo boolean NOT NULL DEFAULT false;
ALTER TABLE produto ADD CONSTRAINT produto_combo_sem_producao CHECK (NOT combo OR tipo_producao_id IS NULL);

CREATE TABLE combo_parte (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  combo_id      integer NOT NULL REFERENCES produto (id),
  nome          text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 40 AND nome !~ '[[:cntrl:]]'),
  ordem         integer NOT NULL DEFAULT 0 CHECK (ordem BETWEEN 0 AND 9999),
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX combo_parte_nome ON combo_parte (combo_id, nome_de_unidade(nome)) WHERE ativo;
CREATE INDEX combo_parte_combo ON combo_parte (combo_id, ordem) WHERE ativo;

CREATE TABLE combo_opcao (
  id                          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parte_id                    integer NOT NULL REFERENCES combo_parte (id),
  produto_id                  integer NOT NULL REFERENCES produto (id),
  -- Tamanho fixo da opção (obrigatório se o produto tiver tamanhos; conferido na gravação).
  tamanho_id                  integer REFERENCES produto_tamanho (id),
  acrescimo_centavos          integer NOT NULL DEFAULT 0 CHECK (acrescimo_centavos BETWEEN 0 AND 999999),
  acrescimo_delivery_centavos integer CHECK (acrescimo_delivery_centavos BETWEEN 0 AND 999999),
  ordem                       integer NOT NULL DEFAULT 0 CHECK (ordem BETWEEN 0 AND 9999),
  ativo                       boolean NOT NULL DEFAULT true,
  criado_em                   timestamptz NOT NULL DEFAULT now(),
  atualizado_em               timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX combo_opcao_unica ON combo_opcao (parte_id, produto_id, coalesce(tamanho_id, 0)) WHERE ativo;
CREATE INDEX combo_opcao_parte ON combo_opcao (parte_id, ordem) WHERE ativo;
CREATE INDEX combo_opcao_produto ON combo_opcao (produto_id) WHERE ativo;
