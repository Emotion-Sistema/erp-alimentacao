-- 0019: fichas técnicas (E08; decisão 0025; RC-01 "da ficha técnica ao consumo"). Só adiciona.
-- Uma FICHA descreve o que algo gasta: um produto do cardápio, um tamanho de produto (receita
-- própria daquele tamanho), um adicional (o que ele acrescenta) ou um PREPARO da casa (tempero,
-- maionese, bechamel...) que entra em outras fichas como se fosse um ingrediente.
-- Cada mudança cria uma VERSÃO nova; versões, itens e pendências nunca mudam nem somem (RC-17):
-- o pedido (E11) vai gravar a versão que usou. Quantidades sempre na unidade do estoque do
-- ingrediente (g, ml, un), em decimal exato. Ficha com pendência não baixa estoque.

-- Custo de referência do ingrediente (até as compras da E09/E10 trazerem o preço real):
-- custo_ref_centavos por custo_ref_quantidade na unidade do estoque. Ex.: R$ 40,00 por 1000 g.
ALTER TABLE ingrediente
  ADD COLUMN custo_ref_centavos integer CHECK (custo_ref_centavos BETWEEN 0 AND 99999999),
  ADD COLUMN custo_ref_quantidade numeric(14, 4) CHECK (custo_ref_quantidade > 0),
  ADD COLUMN custo_ref_em timestamptz,
  ADD CONSTRAINT ingrediente_custo_ref CHECK (
    (custo_ref_centavos IS NULL) = (custo_ref_quantidade IS NULL)
    AND (custo_ref_centavos IS NULL) = (custo_ref_em IS NULL));

CREATE TABLE ficha (
  id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo               text NOT NULL CHECK (tipo IN ('produto', 'tamanho', 'adicional', 'preparo')),
  produto_id         integer REFERENCES produto (id),
  tamanho_id         integer REFERENCES produto_tamanho (id),
  adicional_id       integer REFERENCES adicional (id),
  -- Só no preparo: o nome e a unidade em que ele rende (e em que as outras fichas o usam).
  nome               text CHECK (length(btrim(nome)) BETWEEN 2 AND 80 AND nome !~ '[[:cntrl:]]'),
  unidade_rendimento text CHECK (unidade_rendimento IN ('g', 'ml', 'un')),
  versao_atual_id    integer, -- a FK vem depois de ficha_versao
  ativo              boolean NOT NULL DEFAULT true,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ficha_alvo CHECK (
    (tipo = 'produto'   AND produto_id IS NOT NULL AND tamanho_id IS NULL AND adicional_id IS NULL AND nome IS NULL AND unidade_rendimento IS NULL)
    OR (tipo = 'tamanho'   AND tamanho_id IS NOT NULL AND produto_id IS NULL AND adicional_id IS NULL AND nome IS NULL AND unidade_rendimento IS NULL)
    OR (tipo = 'adicional' AND adicional_id IS NOT NULL AND produto_id IS NULL AND tamanho_id IS NULL AND nome IS NULL AND unidade_rendimento IS NULL)
    OR (tipo = 'preparo'   AND nome IS NOT NULL AND unidade_rendimento IS NOT NULL AND produto_id IS NULL AND tamanho_id IS NULL AND adicional_id IS NULL))
);
CREATE UNIQUE INDEX ficha_do_produto ON ficha (produto_id) WHERE ativo AND tipo = 'produto';
CREATE UNIQUE INDEX ficha_do_tamanho ON ficha (tamanho_id) WHERE ativo AND tipo = 'tamanho';
CREATE UNIQUE INDEX ficha_do_adicional ON ficha (adicional_id) WHERE ativo AND tipo = 'adicional';
CREATE UNIQUE INDEX ficha_preparo_nome ON ficha (nome_de_unidade(nome)) WHERE ativo AND tipo = 'preparo';

CREATE TABLE ficha_versao (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ficha_id          integer NOT NULL REFERENCES ficha (id),
  numero            integer NOT NULL CHECK (numero >= 1),
  -- Quanto a receita rende: porções (produto, tamanho, adicional) ou quantidade na unidade de
  -- rendimento (preparo). Nulo = pendência (não dá para saber quanto cada porção gasta).
  rende             numeric(14, 4) CHECK (rende > 0),
  -- Quanto vai em cada porção servida (para conferir peso e perda); opcional.
  porcao_quantidade numeric(14, 4) CHECK (porcao_quantidade > 0),
  porcao_unidade    text CHECK (porcao_unidade IN ('g', 'ml', 'un')),
  tempo_min         integer CHECK (tempo_min BETWEEN 0 AND 1440),
  validade_dias     integer CHECK (validade_dias BETWEEN 0 AND 365),
  etapas            jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(etapas) = 'array'),
  equipamentos      text[] NOT NULL DEFAULT '{}',
  observacoes       text CHECK (length(observacoes) <= 2000),
  motivo            text CHECK (length(motivo) <= 200),
  criada_por        integer NOT NULL REFERENCES usuario (id),
  criada_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ficha_versao_numero UNIQUE (ficha_id, numero),
  CONSTRAINT ficha_versao_porcao CHECK ((porcao_quantidade IS NULL) = (porcao_unidade IS NULL))
);
ALTER TABLE ficha ADD CONSTRAINT ficha_versao_atual FOREIGN KEY (versao_atual_id) REFERENCES ficha_versao (id);

-- Item da versão: um ingrediente OU um preparo (outra ficha), com a quantidade por receita
-- (que rende `rende`). Quantidade nula = pendência ("a gosto", medida caseira sem peso).
CREATE TABLE ficha_item (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  versao_id      integer NOT NULL REFERENCES ficha_versao (id),
  ordem          integer NOT NULL CHECK (ordem BETWEEN 1 AND 999),
  ingrediente_id integer REFERENCES ingrediente (id),
  preparo_id     integer REFERENCES ficha (id),
  quantidade     numeric(14, 4) CHECK (quantidade > 0),
  -- Opcional: pode não ir (gelo, açúcar, "com ou sem clara"). Conta no consumo (hipótese).
  opcional       boolean NOT NULL DEFAULT false,
  medida_caseira text CHECK (length(btrim(medida_caseira)) BETWEEN 1 AND 60 AND medida_caseira !~ '[[:cntrl:]]'),
  observacao     text CHECK (length(btrim(observacao)) BETWEEN 1 AND 120 AND observacao !~ '[[:cntrl:]]'),
  CONSTRAINT ficha_item_um_so CHECK ((ingrediente_id IS NULL) <> (preparo_id IS NULL)),
  CONSTRAINT ficha_item_ordem UNIQUE (versao_id, ordem)
);
CREATE INDEX ficha_item_preparo ON ficha_item (preparo_id) WHERE preparo_id IS NOT NULL;
CREATE INDEX ficha_item_ingrediente ON ficha_item (ingrediente_id) WHERE ingrediente_id IS NOT NULL;

-- Pendência anotada pela equipe ("tempero a gosto", "número não fecha"). Some na versão seguinte
-- que não a trouxer.
CREATE TABLE ficha_pendencia (
  id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  versao_id integer NOT NULL REFERENCES ficha_versao (id),
  texto     text NOT NULL CHECK (length(btrim(texto)) BETWEEN 2 AND 200 AND texto !~ '[[:cntrl:]]')
);

-- Versão, item e pendência são histórico: nada muda nem some.
CREATE FUNCTION ficha_historico_imutavel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Versão de ficha técnica não muda nem é apagada; grave uma versão nova.'
    USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER ficha_versao_imutavel BEFORE UPDATE OR DELETE ON ficha_versao
  FOR EACH ROW EXECUTE FUNCTION ficha_historico_imutavel();
CREATE TRIGGER ficha_item_imutavel BEFORE UPDATE OR DELETE ON ficha_item
  FOR EACH ROW EXECUTE FUNCTION ficha_historico_imutavel();
CREATE TRIGGER ficha_pendencia_imutavel BEFORE UPDATE OR DELETE ON ficha_pendencia
  FOR EACH ROW EXECUTE FUNCTION ficha_historico_imutavel();

-- A versão atual tem de ser desta ficha.
CREATE FUNCTION ficha_versao_da_ficha() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.versao_atual_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM ficha_versao v WHERE v.id = NEW.versao_atual_id AND v.ficha_id = NEW.id) THEN
    RAISE EXCEPTION 'A versão atual precisa ser da própria ficha.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ficha_versao_atual_da_ficha BEFORE INSERT OR UPDATE OF versao_atual_id ON ficha
  FOR EACH ROW EXECUTE FUNCTION ficha_versao_da_ficha();

-- Limite de alerta do custo sobre o preço (pontos-base: 3500 = 35%). Uma linha só.
CREATE TABLE ficha_config (
  id              smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  limite_custo_pb integer NOT NULL DEFAULT 3500 CHECK (limite_custo_pb BETWEEN 100 AND 10000),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_por  integer REFERENCES usuario (id)
);
INSERT INTO ficha_config (id) VALUES (1);
