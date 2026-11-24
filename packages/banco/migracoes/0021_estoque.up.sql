-- 0021: estoque (E09; RC-09; decisão 0027). Só adiciona.
-- Cada ingrediente (ou preparo da casa) é um ITEM DE ESTOQUE. O saldo fica separado por LOTE
-- (com validade opcional), ÁREA (cozinha, bebidas do salão, cafeteria, sorvete), LOCAL (em uso ou
-- guardado) e situação (livre ou bloqueado). Quantidades na unidade do estoque (g, ml, un), em
-- decimal exato com 4 casas. Dinheiro em centavos inteiros.
-- Tudo o que muda o saldo é um MOVIMENTO: movimentos, seus itens e suas linhas nunca mudam nem
-- somem (RC-17). Erro se corrige com movimento contrário (estorno) ou ajuste por contagem.
-- Custo: custo médio do item (valor total / quantidade total). Saída leva o valor proporcional;
-- quando a quantidade zera, o valor zera junto (a soma dos movimentos fecha com o saldo).

CREATE TABLE estoque_item (
  id                      integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ingrediente_id          integer UNIQUE REFERENCES ingrediente (id),
  preparo_id              integer UNIQUE REFERENCES ficha (id),
  -- Área onde o preparo é feito e guardado (o ingrediente usa a do cadastro).
  area_preparo            text CHECK (area_preparo IN ('cozinha', 'bebidas_salao', 'cafeteria', 'sorvete')),
  -- Totais de todas as áreas, locais, lotes e situações (inclui bloqueado e vencido).
  quantidade              numeric(16, 4) NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  valor_centavos          bigint NOT NULL DEFAULT 0 CHECK (valor_centavos >= 0),
  -- Custo da última entrada com custo (para dar valor a ajuste quando o item está zerado).
  ultimo_custo_centavos   bigint CHECK (ultimo_custo_centavos >= 0),
  ultimo_custo_quantidade numeric(16, 4) CHECK (ultimo_custo_quantidade > 0),
  criado_em               timestamptz NOT NULL DEFAULT now(),
  atualizado_em           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estoque_item_um_so CHECK ((ingrediente_id IS NULL) <> (preparo_id IS NULL)),
  CONSTRAINT estoque_item_area_do_preparo CHECK ((preparo_id IS NULL) = (area_preparo IS NULL)),
  CONSTRAINT estoque_item_zerado_sem_valor CHECK (quantidade > 0 OR valor_centavos = 0),
  CONSTRAINT estoque_item_ultimo_custo CHECK ((ultimo_custo_centavos IS NULL) = (ultimo_custo_quantidade IS NULL))
);

-- O preparo do estoque tem de ser uma ficha de PREPARO.
CREATE FUNCTION estoque_item_de_preparo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.preparo_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ficha WHERE id = NEW.preparo_id AND tipo = 'preparo') THEN
    RAISE EXCEPTION 'Só preparo da casa tem estoque próprio.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.ingrediente_id IS DISTINCT FROM OLD.ingrediente_id OR NEW.preparo_id IS DISTINCT FROM OLD.preparo_id) THEN
    RAISE EXCEPTION 'O item de estoque não muda de ingrediente nem de preparo.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER estoque_item_preparo BEFORE INSERT OR UPDATE ON estoque_item
  FOR EACH ROW EXECUTE FUNCTION estoque_item_de_preparo();

CREATE TABLE estoque_movimento (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo            text NOT NULL CHECK (tipo IN (
                    'entrada',       -- compra recebida (ou doação, troca do fornecedor)
                    'saldo_inicial', -- o que já havia na loja ao começar a usar o sistema
                    'transferencia', -- em uso <-> guardado, ou de uma área para outra
                    'perda',         -- estragou, venceu, caiu, erro no preparo...
                    'bloqueio',      -- separa do livre (quarentena, suspeita, vencido)
                    'desbloqueio',   -- volta para o livre
                    'consumo',       -- venda (E11) e uso interno
                    'producao',      -- preparo da casa: gasta ingredientes, cria saldo do preparo
                    'ajuste',        -- diferença da contagem
                    'custo',         -- correção do custo de uma entrada (só valor)
                    'estorno')),     -- desfaz um movimento lançado errado
  motivo          text CHECK (length(btrim(motivo)) BETWEEN 1 AND 40 AND motivo !~ '[[:cntrl:]]'),
  observacao      text CHECK (length(btrim(observacao)) BETWEEN 1 AND 500),
  autor_id        integer NOT NULL REFERENCES usuario (id),
  -- Transferência de uma área para outra: quem recebeu.
  recebido_por    integer REFERENCES usuario (id),
  -- Estorno: o movimento desfeito. Cada movimento é desfeito uma vez só.
  estorno_de      bigint UNIQUE REFERENCES estoque_movimento (id),
  -- Movimento cujo custo foi corrigido (tipo 'custo').
  corrige_custo_de bigint REFERENCES estoque_movimento (id),
  -- Chave contra repetição (toque duplo, reenvio do aplicativo, pedido da E11).
  chave           text UNIQUE CHECK (length(chave) BETWEEN 8 AND 200 AND chave !~ '[[:cntrl:]]'),
  assinatura      text CHECK (length(assinatura) = 64),
  -- Origem externa (E11: 'pedido' + id). Texto para não amarrar a tabelas futuras.
  origem_tipo     text CHECK (origem_tipo ~ '^[a-z_]{2,30}$'),
  origem_id       text CHECK (length(origem_id) BETWEEN 1 AND 60),
  -- Compra (entrada): fornecedor e nota digitados à mão.
  fornecedor_id   integer REFERENCES fornecedor (id),
  nota_numero     text CHECK (length(btrim(nota_numero)) BETWEEN 1 AND 60 AND nota_numero !~ '[[:cntrl:]]'),
  nota_data       date,
  -- Produção de preparo: a versão da ficha usada, quanto a receita previa e quanto saiu.
  ficha_versao_id integer REFERENCES ficha_versao (id),
  previsto        numeric(16, 4) CHECK (previsto > 0),
  criado_em       timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT estoque_movimento_chave_assinada CHECK ((chave IS NULL) = (assinatura IS NULL)),
  CONSTRAINT estoque_movimento_origem CHECK ((origem_tipo IS NULL) = (origem_id IS NULL)),
  CONSTRAINT estoque_movimento_estorno CHECK ((tipo = 'estorno') = (estorno_de IS NOT NULL)),
  CONSTRAINT estoque_movimento_custo CHECK ((tipo = 'custo') = (corrige_custo_de IS NOT NULL)),
  CONSTRAINT estoque_movimento_producao CHECK ((tipo = 'producao') = (ficha_versao_id IS NOT NULL) AND (ficha_versao_id IS NULL) = (previsto IS NULL)),
  CONSTRAINT estoque_movimento_compra CHECK (tipo IN ('entrada', 'saldo_inicial') OR (fornecedor_id IS NULL AND nota_numero IS NULL AND nota_data IS NULL))
);
CREATE INDEX estoque_movimento_quando ON estoque_movimento (criado_em);
CREATE INDEX estoque_movimento_origem ON estoque_movimento (origem_tipo, origem_id) WHERE origem_tipo IS NOT NULL;

CREATE TABLE estoque_lote (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id      integer NOT NULL REFERENCES estoque_item (id),
  -- Último dia em que pode ser usado. Nulo = sem validade informada.
  validade     date,
  -- Código do lote do fabricante ou fornecedor (opcional).
  codigo       text CHECK (length(btrim(codigo)) BETWEEN 1 AND 60 AND codigo !~ '[[:cntrl:]]'),
  -- O movimento que criou o lote (entrada, saldo inicial, produção ou ajuste).
  movimento_id bigint NOT NULL REFERENCES estoque_movimento (id),
  criado_em    timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX estoque_lote_item ON estoque_lote (item_id);

-- Saldo atual de cada pedaço do estoque. É o único lugar que muda; cada mudança tem a linha do
-- movimento correspondente (a soma das linhas é sempre igual ao saldo).
CREATE TABLE estoque_saldo (
  lote_id    integer NOT NULL REFERENCES estoque_lote (id),
  area       text NOT NULL CHECK (area IN ('cozinha', 'bebidas_salao', 'cafeteria', 'sorvete')),
  local      text NOT NULL CHECK (local IN ('em_uso', 'guardado')),
  bloqueado  boolean NOT NULL,
  item_id    integer NOT NULL REFERENCES estoque_item (id),
  quantidade numeric(16, 4) NOT NULL CHECK (quantidade >= 0),
  PRIMARY KEY (lote_id, area, local, bloqueado)
);
CREATE INDEX estoque_saldo_item ON estoque_saldo (item_id, area, local) WHERE quantidade > 0;

-- Por item do movimento: quanto mudou no total e no valor, e como ficou depois (histórico do item).
CREATE TABLE estoque_movimento_item (
  movimento_id      bigint NOT NULL REFERENCES estoque_movimento (id),
  item_id           integer NOT NULL REFERENCES estoque_item (id),
  quantidade        numeric(16, 4) NOT NULL,
  valor_centavos    bigint NOT NULL,
  quantidade_depois numeric(16, 4) NOT NULL CHECK (quantidade_depois >= 0),
  valor_depois      bigint NOT NULL CHECK (valor_depois >= 0),
  -- Consumo que não achou saldo (venda autorizada sem saldo): fica registrado para a contagem.
  faltou            numeric(16, 4) NOT NULL DEFAULT 0 CHECK (faltou >= 0),
  -- Entrada sem custo informado: valor estimado (custo médio, último custo ou custo de referência).
  custo_estimado    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (movimento_id, item_id)
);
CREATE INDEX estoque_movimento_item_do_item ON estoque_movimento_item (item_id, movimento_id);

-- Cada pedaço de saldo que o movimento tocou (+ entra, - sai).
CREATE TABLE estoque_movimento_linha (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  movimento_id bigint NOT NULL REFERENCES estoque_movimento (id),
  item_id      integer NOT NULL REFERENCES estoque_item (id),
  lote_id      integer NOT NULL REFERENCES estoque_lote (id),
  area         text NOT NULL CHECK (area IN ('cozinha', 'bebidas_salao', 'cafeteria', 'sorvete')),
  local        text NOT NULL CHECK (local IN ('em_uso', 'guardado')),
  bloqueado    boolean NOT NULL,
  quantidade   numeric(16, 4) NOT NULL CHECK (quantidade <> 0),
  -- Passagem automática do guardado para o em uso, feita pelo consumo (RC-09 seção 1).
  automatica   boolean NOT NULL DEFAULT false
);
CREATE INDEX estoque_movimento_linha_mov ON estoque_movimento_linha (movimento_id);
CREATE INDEX estoque_movimento_linha_lote ON estoque_movimento_linha (lote_id);

-- Histórico: nada muda nem some.
CREATE FUNCTION estoque_historico_imutavel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Movimento de estoque não muda nem é apagado; lance um movimento contrário.'
    USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER estoque_movimento_imutavel BEFORE UPDATE OR DELETE ON estoque_movimento
  FOR EACH ROW EXECUTE FUNCTION estoque_historico_imutavel();
CREATE TRIGGER estoque_movimento_item_imutavel BEFORE UPDATE OR DELETE ON estoque_movimento_item
  FOR EACH ROW EXECUTE FUNCTION estoque_historico_imutavel();
CREATE TRIGGER estoque_movimento_linha_imutavel BEFORE UPDATE OR DELETE ON estoque_movimento_linha
  FOR EACH ROW EXECUTE FUNCTION estoque_historico_imutavel();
CREATE TRIGGER estoque_lote_imutavel BEFORE UPDATE OR DELETE ON estoque_lote
  FOR EACH ROW EXECUTE FUNCTION estoque_historico_imutavel();
-- Saldo não se apaga (zera); fica a linha com quantidade 0.
CREATE FUNCTION estoque_saldo_nao_some() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Saldo de estoque não é apagado.' USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER estoque_saldo_sem_apagar BEFORE DELETE ON estoque_saldo
  FOR EACH ROW EXECUTE FUNCTION estoque_saldo_nao_some();

-- Dia de hoje na loja (validade é por dia local).
CREATE FUNCTION hoje_na_loja() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE coalesce((SELECT fuso_horario FROM unidade ORDER BY id LIMIT 1), 'America/Sao_Paulo'))::date
$$;
