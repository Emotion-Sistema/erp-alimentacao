-- 0023: contagem de estoque (E09 parte 4; RC-09 seção 5, item 2; decisão 0027). Só adiciona.
-- Três jeitos: contagem de um item (ex.: depois de "acabou" ou de venda sem saldo), contagem rápida
-- do dia (poucos itens escolhidos pelo sistema) e inventário da área (todos os itens).
-- A contagem é CEGA: quem conta não vê quanto o sistema espera. Ao contar, o sistema guarda quanto
-- esperava NAQUELE momento; ao fechar, lança o ajuste pela diferença (contado - esperado), mesmo que
-- tenha havido venda entre a contagem e o fechamento. Recontar acrescenta um registro (vale o último);
-- nada muda nem some.

CREATE TABLE estoque_contagem (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo         text NOT NULL CHECK (tipo IN ('item', 'rapida', 'inventario')),
  area         text NOT NULL CHECK (area IN ('cozinha', 'bebidas_salao', 'cafeteria', 'sorvete')),
  -- Dia da contagem rápida (uma por área por dia).
  dia          date,
  motivo       text CHECK (length(btrim(motivo)) BETWEEN 1 AND 200 AND motivo !~ '[[:cntrl:]]'),
  aberta_por   integer NOT NULL REFERENCES usuario (id),
  aberta_em    timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT estoque_contagem_dia CHECK ((tipo = 'rapida') = (dia IS NOT NULL))
);
CREATE UNIQUE INDEX estoque_contagem_rapida_do_dia ON estoque_contagem (area, dia) WHERE tipo = 'rapida';

-- O que entra na contagem (fixo desde a abertura).
CREATE TABLE estoque_contagem_item (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contagem_id integer NOT NULL REFERENCES estoque_contagem (id),
  item_id     integer NOT NULL REFERENCES estoque_item (id),
  local       text NOT NULL CHECK (local IN ('em_uso', 'guardado')),
  -- Por que entrou na contagem rápida (faltou, mais_caro, divergiu, sem_contar).
  motivo      text CHECK (motivo IN ('faltou', 'mais_caro', 'divergiu', 'sem_contar')),
  CONSTRAINT estoque_contagem_item_unico UNIQUE (contagem_id, item_id, local)
);

-- Cada vez que alguém conta (vale o último de cada item e local).
CREATE TABLE estoque_contagem_registro (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contagem_item_id  integer NOT NULL REFERENCES estoque_contagem_item (id),
  contado           numeric(16, 4) NOT NULL CHECK (contado >= 0),
  -- Quanto o sistema esperava naquele momento (livre, bloqueado e vencido juntos: o que há de fato).
  esperado          numeric(16, 4) NOT NULL CHECK (esperado >= 0),
  contado_por       integer NOT NULL REFERENCES usuario (id),
  contado_em        timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX estoque_contagem_registro_item ON estoque_contagem_registro (contagem_item_id, id);

-- Fechamento (ou cancelamento) da contagem: uma vez só, com o movimento de ajuste.
CREATE TABLE estoque_contagem_fim (
  contagem_id  integer PRIMARY KEY REFERENCES estoque_contagem (id),
  situacao     text NOT NULL CHECK (situacao IN ('fechada', 'cancelada')),
  movimento_id bigint REFERENCES estoque_movimento (id),
  observacao   text CHECK (length(btrim(observacao)) BETWEEN 1 AND 500 AND observacao !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'),
  -- Valor lançado por linha da contagem (id do item da contagem -> centavos, com sinal).
  valores      jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(valores) = 'object'),
  por          integer NOT NULL REFERENCES usuario (id),
  em           timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT estoque_contagem_fim_ajuste CHECK (situacao = 'fechada' OR movimento_id IS NULL)
);

ALTER TABLE estoque_movimento ADD COLUMN contagem_id integer REFERENCES estoque_contagem (id);
CREATE INDEX estoque_movimento_contagem ON estoque_movimento (contagem_id) WHERE contagem_id IS NOT NULL;
CREATE INDEX estoque_contagem_item_do_item ON estoque_contagem_item (item_id);

CREATE TRIGGER estoque_contagem_imutavel BEFORE UPDATE OR DELETE ON estoque_contagem
  FOR EACH ROW EXECUTE FUNCTION estoque_historico_imutavel();
CREATE TRIGGER estoque_contagem_item_imutavel BEFORE UPDATE OR DELETE ON estoque_contagem_item
  FOR EACH ROW EXECUTE FUNCTION estoque_historico_imutavel();
CREATE TRIGGER estoque_contagem_registro_imutavel BEFORE UPDATE OR DELETE ON estoque_contagem_registro
  FOR EACH ROW EXECUTE FUNCTION estoque_historico_imutavel();
CREATE TRIGGER estoque_contagem_fim_imutavel BEFORE UPDATE OR DELETE ON estoque_contagem_fim
  FOR EACH ROW EXECUTE FUNCTION estoque_historico_imutavel();
