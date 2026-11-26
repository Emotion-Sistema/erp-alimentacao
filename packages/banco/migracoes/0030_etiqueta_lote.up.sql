-- 0030: etiqueta com código em cada lote (ideia nº 16, versão 1; decisão 0029, seção "Etiqueta do
-- lote"). Só adiciona: duas tabelas novas, uma coluna opcional no lote e gatilhos.
--
-- Cada ingrediente e cada preparo da casa tem um CÓDIGO curto (BAC = bacalhau), gerado sozinho pelo
-- nome e sem repetir. Cada lote que entra (compra, saldo inicial, produção de preparo) ganha a
-- ETIQUETA = código + número que nunca se repete (BAC-001, BAC-002...; passa a 4 dígitos sozinho).
-- Regra do código (aprovada em 26/11/2026), a primeira que estiver livre:
--   1. as 3 primeiras letras do nome (BAC = bacalhau);
--   2. a inicial de cada palavra, completando com as letras da última (QMI = queijo minas);
--   3. a primeira letra + duas consoantes do nome, na ordem (BCN = bacon);
--   4. as 2 primeiras letras + número (BA1, BA2... BA10...).
-- Só A-Z, sem acento. Código já usado por outro produto (ou já impresso em etiqueta de lote) não volta.

CREATE TABLE etiqueta_produto (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ingrediente_id integer UNIQUE REFERENCES ingrediente (id),
  preparo_id     integer UNIQUE REFERENCES ficha (id),
  -- 2 a 5 caracteres: começa com letra; o resto letra ou número (o número só vem da regra 4 ou
  -- de quem trocar no cadastro).
  codigo         text NOT NULL CHECK (codigo ~ '^[A-Z][A-Z0-9]{1,4}$'),
  -- Desligado (sal, açúcar, descartáveis): o lote entra sem etiqueta.
  usa_etiqueta   boolean NOT NULL DEFAULT true,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por integer REFERENCES usuario (id),
  CONSTRAINT etiqueta_produto_um_so CHECK ((ingrediente_id IS NULL) <> (preparo_id IS NULL))
);
CREATE UNIQUE INDEX etiqueta_produto_codigo ON etiqueta_produto (codigo);
CREATE TRIGGER etiqueta_produto_sem_truncate BEFORE TRUNCATE ON etiqueta_produto
  FOR EACH STATEMENT EXECUTE FUNCTION recusar_alteracao();
-- O código pertence ao produto: não troca de dono e não some.
CREATE FUNCTION etiqueta_produto_dono_fixo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'O código da etiqueta não é apagado.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.ingrediente_id IS DISTINCT FROM OLD.ingrediente_id OR NEW.preparo_id IS DISTINCT FROM OLD.preparo_id THEN
    RAISE EXCEPTION 'O código da etiqueta não muda de produto.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER etiqueta_produto_dono BEFORE UPDATE OR DELETE ON etiqueta_produto
  FOR EACH ROW EXECUTE FUNCTION etiqueta_produto_dono_fixo();

-- Último número usado por código. Fica pelo CÓDIGO (não pelo produto): se o código mudar ou outro
-- produto herdar um código antigo, a numeração continua e nenhuma etiqueta se repete.
CREATE TABLE etiqueta_sequencia (
  codigo text PRIMARY KEY CHECK (codigo ~ '^[A-Z][A-Z0-9]{1,4}$'),
  ultimo integer NOT NULL CHECK (ultimo >= 1)
);
CREATE TRIGGER etiqueta_sequencia_sem_apagar BEFORE DELETE ON etiqueta_sequencia
  FOR EACH ROW EXECUTE FUNCTION recusar_alteracao();
CREATE TRIGGER etiqueta_sequencia_sem_truncate BEFORE TRUNCATE ON etiqueta_sequencia
  FOR EACH STATEMENT EXECUTE FUNCTION recusar_alteracao();

-- A etiqueta do lote. Nulo = lote sem etiqueta (produto com etiqueta desligada, sobra de contagem,
-- lotes de antes desta migração). Única para sempre.
ALTER TABLE estoque_lote ADD COLUMN etiqueta text UNIQUE CHECK (etiqueta ~ '^[A-Z][A-Z0-9]{1,4}-[0-9]{3,}$');

-- Letras do nome, sem acento, em maiúsculas, separadas por palavra.
CREATE FUNCTION etiqueta_palavras(nome text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(array_remove(string_to_array(btrim(regexp_replace(upper(translate(nome,
    'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
    'aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNY')), '[^A-Z]+', ' ', 'g')), ' '), ''), '{}')
$$;

-- Os códigos possíveis para o nome, na ordem da regra.
CREATE FUNCTION etiqueta_candidatos(nome text) RETURNS SETOF text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  p text[] := etiqueta_palavras(nome);
  letras text := array_to_string(etiqueta_palavras(nome), '');
  n int := coalesce(array_length(etiqueta_palavras(nome), 1), 0);
  s text;
  resto text;
  consoantes text;
  i int;
  j int;
  dois text;
BEGIN
  -- 1. As 3 primeiras letras.
  IF length(letras) >= 3 THEN RETURN NEXT left(letras, 3); END IF;
  -- 2. Inicial de cada palavra, completando com a última.
  IF n >= 2 THEN
    s := '';
    FOR i IN 1 .. n - 1 LOOP s := s || left(p[i], 1); END LOOP;
    s := left(s || p[n], 3);
    IF length(s) = 3 THEN RETURN NEXT s; END IF;
  END IF;
  -- 3. Primeira letra + duas consoantes do resto, na ordem.
  IF length(letras) >= 3 THEN
    resto := substr(letras, 2);
    consoantes := regexp_replace(resto, '[AEIOU]', '', 'g');
    FOR i IN 1 .. length(consoantes) - 1 LOOP
      FOR j IN i + 1 .. length(consoantes) LOOP
        RETURN NEXT left(letras, 1) || substr(consoantes, i, 1) || substr(consoantes, j, 1);
      END LOOP;
    END LOOP;
  END IF;
  -- 4. Duas letras + número (nome curto demais completa com X).
  dois := left(rpad(letras, 2, 'X'), 2);
  FOR i IN 1 .. 999 LOOP RETURN NEXT dois || i::text; END LOOP;
END $$;

-- O primeiro código livre: nem de outro produto, nem já usado em etiqueta de lote.
CREATE FUNCTION etiqueta_escolher(nome text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE c text;
BEGIN
  FOR c IN SELECT * FROM etiqueta_candidatos(nome) LOOP
    IF NOT EXISTS (SELECT 1 FROM etiqueta_produto WHERE codigo = c)
       AND NOT EXISTS (SELECT 1 FROM etiqueta_sequencia WHERE codigo = c) THEN
      RETURN c;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'Não há código livre para "%".', nome USING ERRCODE = 'check_violation';
END $$;

-- Ingrediente ou preparo novo ganha o código na hora, por qualquer caminho (tela, planilha,
-- cadastro em lote). A trava evita que dois cadastros ao mesmo tempo escolham o mesmo código.
CREATE FUNCTION etiqueta_ao_cadastrar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('etiqueta:codigo'));
  IF TG_TABLE_NAME = 'ingrediente' THEN
    INSERT INTO etiqueta_produto (ingrediente_id, codigo) VALUES (NEW.id, etiqueta_escolher(NEW.nome));
  ELSE
    INSERT INTO etiqueta_produto (preparo_id, codigo) VALUES (NEW.id, etiqueta_escolher(NEW.nome));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER ingrediente_etiqueta AFTER INSERT ON ingrediente
  FOR EACH ROW EXECUTE FUNCTION etiqueta_ao_cadastrar();
CREATE TRIGGER ficha_etiqueta AFTER INSERT ON ficha
  FOR EACH ROW WHEN (NEW.tipo = 'preparo') EXECUTE FUNCTION etiqueta_ao_cadastrar();

-- Lote novo de compra, saldo inicial ou produção ganha a etiqueta. Ninguém escolhe a etiqueta à mão.
-- O item já está travado pelo lançamento (FOR UPDATE em ordem de id), então dois lançamentos do
-- mesmo produto não disputam o número.
CREATE FUNCTION estoque_lote_etiquetar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  t text;
  c text;
  usa boolean;
  n int;
BEGIN
  NEW.etiqueta := NULL;
  SELECT tipo INTO t FROM estoque_movimento WHERE id = NEW.movimento_id;
  IF t NOT IN ('entrada', 'saldo_inicial', 'producao') THEN RETURN NEW; END IF;
  SELECT e.codigo, e.usa_etiqueta INTO c, usa
    FROM estoque_item i
    JOIN etiqueta_produto e ON e.ingrediente_id = i.ingrediente_id OR e.preparo_id = i.preparo_id
    WHERE i.id = NEW.item_id;
  IF c IS NULL OR NOT usa THEN RETURN NEW; END IF;
  INSERT INTO etiqueta_sequencia AS s (codigo, ultimo) VALUES (c, 1)
    ON CONFLICT (codigo) DO UPDATE SET ultimo = s.ultimo + 1
    RETURNING ultimo INTO n;
  NEW.etiqueta := c || '-' || CASE WHEN n < 1000 THEN lpad(n::text, 3, '0') ELSE n::text END;
  RETURN NEW;
END $$;
CREATE TRIGGER estoque_lote_etiqueta BEFORE INSERT ON estoque_lote
  FOR EACH ROW EXECUTE FUNCTION estoque_lote_etiquetar();

-- Os já cadastrados (ativos ou não) ganham código na ordem alfabética, ingredientes e preparos juntos.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT * FROM (
      SELECT 'ingrediente' AS tipo, id, nome FROM ingrediente
      UNION ALL
      SELECT 'preparo', id, nome FROM ficha WHERE tipo = 'preparo'
    ) x ORDER BY lower(nome), tipo, id
  LOOP
    IF r.tipo = 'ingrediente' THEN
      INSERT INTO etiqueta_produto (ingrediente_id, codigo) VALUES (r.id, etiqueta_escolher(r.nome));
    ELSE
      INSERT INTO etiqueta_produto (preparo_id, codigo) VALUES (r.id, etiqueta_escolher(r.nome));
    END IF;
  END LOOP;
END $$;
