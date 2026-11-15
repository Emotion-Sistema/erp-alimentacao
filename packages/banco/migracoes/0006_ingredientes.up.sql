-- 0006: cadastros da E07, parte 1 (decisão 0015): unidades de medida, fornecedores,
-- ingredientes e conversões. Só adiciona. Nada se apaga: o que sai de uso fica inativo (RC-17).

-- Unidades de medida padrão. Cada uma é de uma grandeza e vale um fator EXATO da unidade base
-- da grandeza (massa: g; volume: ml; contagem: un). Não são cadastro: a conversão entre elas é
-- física e o sistema a faz sozinho. Entre grandezas (kg -> litro, unidade -> gramas) só com a
-- conversão explícita de cada ingrediente (tabela ingrediente_conversao).
CREATE TABLE unidade_medida (
  codigo   text PRIMARY KEY,
  nome     text NOT NULL,
  grandeza text NOT NULL CHECK (grandeza IN ('massa', 'volume', 'contagem')),
  fator    numeric(14, 4) NOT NULL CHECK (fator > 0),
  -- Outros jeitos de escrever a mesma unidade (sem acento, em minúsculas).
  apelidos text[] NOT NULL DEFAULT '{}'
);
INSERT INTO unidade_medida (codigo, nome, grandeza, fator, apelidos) VALUES
  ('g',  'grama',      'massa',    1,    '{gr,grs,grama,gramas}'),
  ('kg', 'quilograma', 'massa',    1000, '{kgs,quilo,quilos,kilo,kilos,quilograma,quilogramas}'),
  ('ml', 'mililitro',  'volume',   1,    '{mls,mililitro,mililitros}'),
  ('l',  'litro',      'volume',   1000, '{lt,lts,litro,litros}'),
  ('un', 'unidade',    'contagem', 1,    '{und,unid,unidade,unidades}'),
  ('dz', 'dúzia',      'contagem', 12,   '{duzia,duzias,dúzia,dúzias}');

-- Acha a unidade padrão escrita de qualquer jeito conhecido ('KG', 'quilo', ' Litros ').
CREATE FUNCTION unidade_padrao(p_texto text) RETURNS unidade_medida
LANGUAGE sql STABLE AS $$
  SELECT u.* FROM unidade_medida u
  WHERE lower(btrim(p_texto)) = u.codigo OR lower(btrim(p_texto)) = ANY (u.apelidos)
$$;

CREATE TABLE fornecedor (
  id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome               text NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 120),
  -- CPF (11) ou CNPJ (14), só os dígitos, sempre texto.
  documento          text CHECK (documento ~ '^([0-9]{11}|[0-9]{14})$'),
  contato            text CHECK (length(contato) <= 120),
  telefone           text CHECK (length(telefone) <= 30),
  email              text CHECK (length(email) <= 200),
  -- Dias que o fornecedor leva para entregar: entra na linha de emergência (RC-09, E10).
  prazo_entrega_dias integer CHECK (prazo_entrega_dias BETWEEN 0 AND 90),
  observacao         text CHECK (length(observacao) <= 500),
  ativo              boolean NOT NULL DEFAULT true,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fornecedor_nome ON fornecedor (lower(btrim(nome)));
CREATE UNIQUE INDEX fornecedor_documento ON fornecedor (documento) WHERE documento IS NOT NULL;

CREATE TABLE ingrediente (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome          text NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 120),
  -- Unidade em que o estoque conta e a ficha técnica gasta. Não muda depois de criada
  -- (gatilho abaixo): mudar trocaria o sentido de todo saldo e de toda conversão.
  unidade_base  text NOT NULL REFERENCES unidade_medida (codigo) CHECK (unidade_base IN ('g', 'ml', 'un')),
  -- Área de estoque e quem cuida dela (RC-09 seção 4, decisão 0008).
  area_estoque  text NOT NULL CHECK (area_estoque IN ('cozinha', 'bebidas_salao', 'cafeteria', 'sorvete')),
  fornecedor_id integer REFERENCES fornecedor (id),
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ingrediente_nome ON ingrediente (lower(btrim(nome)));

CREATE FUNCTION ingrediente_base_fixa() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.unidade_base <> OLD.unidade_base THEN
    RAISE EXCEPTION 'A unidade do estoque de "%" não muda depois de criada. Desative o ingrediente e cadastre outro.', OLD.nome
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ingrediente_unidade_base_fixa
  BEFORE UPDATE ON ingrediente
  FOR EACH ROW EXECUTE FUNCTION ingrediente_base_fixa();

-- Conversão explícita de um ingrediente: 1 <nome> = <quantidade_base> na unidade base dele.
-- Ex.: "caixa" = 12 un; "saco 5 kg" = 5000 g; "kg" = 1030 ml (leite, pela densidade);
-- "unidade" = 50 g (ovo). Unidade padrão da MESMA grandeza não entra aqui: o sistema já sabe
-- (kg = 1000 g sempre) e uma segunda equivalência seria errada ou repetida.
CREATE TABLE ingrediente_conversao (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ingrediente_id  integer NOT NULL REFERENCES ingrediente (id),
  nome            text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 40),
  quantidade_base numeric(14, 4) NOT NULL CHECK (quantidade_base > 0),
  ativo           boolean NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ingrediente_conversao_nome ON ingrediente_conversao (ingrediente_id, lower(btrim(nome)));

CREATE FUNCTION conversao_sem_equivalencia_errada() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  u     unidade_medida;
  base  unidade_medida;
BEGIN
  SELECT * INTO base FROM unidade_medida WHERE codigo = (SELECT unidade_base FROM ingrediente WHERE id = NEW.ingrediente_id);
  SELECT * INTO u FROM unidade_padrao(NEW.nome);
  IF u.codigo IS NOT NULL AND u.grandeza = base.grandeza THEN
    RAISE EXCEPTION '"%" já é convertido sozinho (1 % = % %). Não cadastre outra equivalência.',
      btrim(NEW.nome), u.codigo, trim(trailing '.' FROM trim(trailing '0' FROM u.fator::text)), base.codigo
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ingrediente_conversao_valida
  BEFORE INSERT OR UPDATE ON ingrediente_conversao
  FOR EACH ROW EXECUTE FUNCTION conversao_sem_equivalencia_errada();

-- Converte uma quantidade de qualquer unidade aceita para a unidade base do ingrediente.
-- Mesma grandeza: pelo fator padrão. Senão: pela conversão ativa do ingrediente. Sem caminho:
-- erro (nunca chuta). É a ÚNICA conta de conversão do sistema: compra, ficha técnica e
-- importação usam esta função.
CREATE FUNCTION para_unidade_base(p_ingrediente integer, p_quantidade numeric, p_unidade text) RETURNS numeric
LANGUAGE plpgsql STABLE AS $$
DECLARE
  base  unidade_medida;
  u     unidade_medida;
  fator numeric;
BEGIN
  SELECT um.* INTO base FROM ingrediente i JOIN unidade_medida um ON um.codigo = i.unidade_base WHERE i.id = p_ingrediente;
  IF base.codigo IS NULL THEN
    RAISE EXCEPTION 'Ingrediente % não existe.', p_ingrediente USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO u FROM unidade_padrao(p_unidade);
  IF u.codigo IS NOT NULL AND u.grandeza = base.grandeza THEN
    RETURN p_quantidade * u.fator; -- a base (g, ml, un) tem fator 1
  END IF;
  SELECT c.quantidade_base INTO fator FROM ingrediente_conversao c
  WHERE c.ingrediente_id = p_ingrediente AND c.ativo AND lower(btrim(c.nome)) = lower(btrim(p_unidade));
  IF fator IS NULL THEN
    RAISE EXCEPTION 'Não há conversão de "%" para %.', btrim(p_unidade), base.codigo USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN p_quantidade * fator;
END $$;
