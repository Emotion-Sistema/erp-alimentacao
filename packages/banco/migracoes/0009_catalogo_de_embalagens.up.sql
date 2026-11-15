-- 0009: catálogo de embalagens (ideia nº 6, 15/11/2026; decisão 0015, item 10). Só adiciona.
-- Modelo de embalagem = tipo + tamanho opcional ("saco 25 kg", "caixa 12 un", "caixa"), com
-- fornecedor opcional (vira o padrão dele). No ingrediente, a embalagem continua sendo a
-- conversão (ingrediente_conversao); agora ela pode lembrar de que modelo veio. A conta não muda:
-- para_unidade_base continua a única conta de conversão.

-- Nome do modelo, sempre igual para o mesmo tipo/tamanho: "saco 25 kg", "galão 2,5 l", "caixa".
CREATE FUNCTION nome_do_modelo(p_tipo text, p_tamanho numeric, p_unidade text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT lower(regexp_replace(btrim(p_tipo), '\s+', ' ', 'g')) ||
    CASE WHEN p_tamanho IS NULL THEN ''
         ELSE ' ' || replace(rtrim(rtrim(p_tamanho::text, '0'), '.'), '.', ',') || ' ' || p_unidade END
$$;

CREATE TABLE embalagem_modelo (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Tipo é a categoria no catálogo (saco, caixa, fardo...); letras obrigatórias, sem número.
  tipo          text NOT NULL CHECK (length(btrim(tipo)) BETWEEN 2 AND 24 AND tipo ~ '[[:alpha:]]'
                                     AND tipo !~ '[0-9[:cntrl:]]'),
  tamanho       numeric(14, 4) CHECK (tamanho > 0 AND tamanho <= 1000000),
  unidade       text REFERENCES unidade_medida (codigo),
  fornecedor_id integer REFERENCES fornecedor (id),
  nome          text GENERATED ALWAYS AS (nome_do_modelo(tipo, tamanho, unidade)) STORED,
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT embalagem_modelo_tamanho_com_unidade CHECK ((tamanho IS NULL) = (unidade IS NULL)),
  -- Cabe no nome da conversão do ingrediente (até 40).
  CONSTRAINT embalagem_modelo_nome_curto CHECK (length(nome) <= 40)
);
-- Sem repetir entre os ativos: o mesmo modelo pode existir "para qualquer fornecedor" e para cada um.
CREATE UNIQUE INDEX embalagem_modelo_unico ON embalagem_modelo (nome_de_unidade(nome), coalesce(fornecedor_id, 0)) WHERE ativo;

-- Modelo já usado por um ingrediente não muda de tipo nem de tamanho (o nome da embalagem do
-- ingrediente ficaria diferente do modelo). Fornecedor e ativo podem mudar.
CREATE FUNCTION embalagem_modelo_fixo_se_usado() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.tipo, NEW.tamanho, NEW.unidade) IS DISTINCT FROM (OLD.tipo, OLD.tamanho, OLD.unidade)
     AND EXISTS (SELECT 1 FROM ingrediente_conversao c WHERE c.modelo_id = OLD.id AND c.ativo) THEN
    RAISE EXCEPTION 'A embalagem "%" já está em uso em ingredientes: o tipo e o tamanho não mudam. Desative-a e crie outra.', OLD.nome
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER embalagem_modelo_fixo
  BEFORE UPDATE ON embalagem_modelo
  FOR EACH ROW EXECUTE FUNCTION embalagem_modelo_fixo_se_usado();

ALTER TABLE ingrediente_conversao ADD COLUMN modelo_id integer REFERENCES embalagem_modelo (id);
CREATE INDEX ingrediente_conversao_modelo ON ingrediente_conversao (modelo_id) WHERE modelo_id IS NOT NULL;

-- Modelos comuns prontos (sem fornecedor). O responsável edita, desativa e cria os dele.
INSERT INTO embalagem_modelo (tipo, tamanho, unidade) VALUES
  ('saco', 1, 'kg'), ('saco', 2, 'kg'), ('saco', 5, 'kg'), ('saco', 25, 'kg'), ('saco', 50, 'kg'),
  ('pacote', 500, 'g'), ('pacote', 1, 'kg'), ('pacote', 5, 'kg'),
  ('caixa', 12, 'un'), ('caixa', 24, 'un'), ('caixa', 30, 'un'), ('caixa', 1, 'l'),
  ('fardo', 6, 'un'), ('fardo', 12, 'un'),
  ('bandeja', 12, 'un'), ('bandeja', 30, 'un'),
  ('lata', 350, 'ml'), ('lata', 395, 'g'),
  ('garrafa', 600, 'ml'), ('garrafa', 1, 'l'), ('garrafa', 2, 'l'),
  ('galão', 5, 'l'), ('galão', 20, 'l'),
  ('pote', 500, 'g'), ('pote', 1, 'kg'),
  ('balde', 2, 'kg'), ('balde', 5, 'kg'), ('balde', 10, 'l');
