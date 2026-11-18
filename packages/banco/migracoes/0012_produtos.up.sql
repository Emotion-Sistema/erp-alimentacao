-- Produtos (E07 parte 2, PR 3; decisão 0018). O cardápio da casa: cada produto é de uma
-- categoria (onde aparece no cardápio e de quem herda o horário de venda, decisão 0016) e,
-- se passa pela produção, de um tipo de produção (em que tela da cozinha aparece, decisão 0017)
-- com o tempo de preparo padrão (temporizador e estimativa, RC-10 seções 3 e 7).
-- Produto sem tipo não passa pela produção (ex.: bebida da geladeira, RC-10 seção 6) e por
-- isso também não tem tempo de preparo.
-- Preço em centavos (inteiro, nunca float). Um preço para todos os canais por enquanto
-- (hipótese da 0018); o preço aplicado na venda será copiado para o pedido (E11).
-- Ordem: lugar do produto dentro da categoria (menor primeiro). Nada se apaga: produto que
-- não se vende mais fica inativo.

CREATE TABLE produto (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome              text NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 60 AND nome !~ '[[:cntrl:]]'),
  descricao         text CHECK (length(descricao) <= 300),
  categoria_id      integer NOT NULL REFERENCES categoria (id),
  tipo_producao_id  integer REFERENCES tipo_producao (id),
  preco_centavos    integer NOT NULL CHECK (preco_centavos BETWEEN 1 AND 999999),
  tempo_preparo_min smallint CHECK (tempo_preparo_min BETWEEN 1 AND 180),
  ordem             integer NOT NULL DEFAULT 0 CHECK (ordem BETWEEN 0 AND 9999),
  ativo             boolean NOT NULL DEFAULT true,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  -- Passa pela produção (tem tipo) se e só se tem tempo de preparo.
  CONSTRAINT produto_tempo_com_tipo CHECK ((tipo_producao_id IS NULL) = (tempo_preparo_min IS NULL))
);
CREATE UNIQUE INDEX produto_nome ON produto (nome_de_unidade(nome)) WHERE ativo;
CREATE INDEX produto_categoria ON produto (categoria_id, ordem) WHERE ativo;
CREATE INDEX produto_tipo ON produto (tipo_producao_id) WHERE tipo_producao_id IS NOT NULL;
