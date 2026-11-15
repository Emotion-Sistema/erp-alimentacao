-- 0006: cadastros da E07, parte 1 (decisão 0015): unidades de medida, fornecedores,
-- ingredientes e conversões. Só adiciona. Nada se apaga: o que sai de uso fica inativo (RC-17).

-- Nome de unidade escrito de qualquer jeito -> forma única para comparar: minúsculas, sem
-- acento, sem pontuação, sem caractere de controle nem espaço especial, espaços juntados, e
-- número separado da letra e sem o "1" da frente ("1 Kg." e "1kg" -> "kg";
-- "Saco 5kg" -> "saco 5 kg"; "10kg" -> "10 kg"). Usada no bloqueio de
-- equivalência errada, na conta de conversão e no índice de nome único.
CREATE FUNCTION nome_de_unidade(p_texto text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT regexp_replace(
           btrim(regexp_replace(regexp_replace(
             translate(lower(p_texto), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
             '[^a-z0-9]+', ' ', 'g'),
             '([0-9])([a-z])', '\1 \2', 'g')),
           '^1 ', '')
$$;

-- Unidades de medida padrão. Cada uma é de uma grandeza e vale um fator EXATO da unidade base
-- da grandeza (massa: g; volume: ml; contagem: un). Não são cadastro: a conversão entre elas é
-- física e o sistema a faz sozinho. Entre grandezas (kg -> litro, unidade -> gramas) só com a
-- conversão explícita de cada ingrediente (tabela ingrediente_conversao). O aplicativo não
-- muda esta tabela (papeis.ts tira INSERT e UPDATE dele); só migração.
CREATE TABLE unidade_medida (
  codigo   text PRIMARY KEY,
  nome     text NOT NULL,
  grandeza text NOT NULL CHECK (grandeza IN ('massa', 'volume', 'contagem')),
  fator    numeric(14, 4) NOT NULL CHECK (fator > 0),
  -- Outros jeitos de escrever a mesma unidade, já na forma de nome_de_unidade().
  apelidos text[] NOT NULL DEFAULT '{}'
);
INSERT INTO unidade_medida (codigo, nome, grandeza, fator, apelidos) VALUES
  ('mg', 'miligrama',  'massa',    0.001,   '{mgs,miligrama,miligramas}'),
  ('g',  'grama',      'massa',    1,       '{gr,grs,grama,gramas}'),
  ('kg', 'quilograma', 'massa',    1000,    '{kgs,quilo,quilos,kilo,kilos,quilograma,quilogramas,kilograma,kilogramas}'),
  ('t',  'tonelada',   'massa',    1000000, '{ton,tonelada,toneladas}'),
  ('ml', 'mililitro',  'volume',   1,       '{mls,cc,cm3,mililitro,mililitros}'),
  ('cl', 'centilitro', 'volume',   10,      '{centilitro,centilitros}'),
  ('dl', 'decilitro',  'volume',   100,     '{decilitro,decilitros}'),
  ('l',  'litro',      'volume',   1000,    '{lt,lts,litro,litros}'),
  ('un', 'unidade',    'contagem', 1,       '{und,unid,unidade,unidades}'),
  ('dz', 'dúzia',      'contagem', 12,      '{duzia,duzias}');

-- Acha a unidade padrão escrita de qualquer jeito conhecido ('KG', 'quilo', ' Litros ', '1 kg.').
CREATE FUNCTION unidade_padrao(p_texto text) RETURNS unidade_medida
LANGUAGE sql STABLE AS $$
  SELECT u.* FROM unidade_medida u
  WHERE nome_de_unidade(p_texto) = u.codigo OR nome_de_unidade(p_texto) = ANY (u.apelidos)
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
-- Nome e documento únicos entre os ATIVOS: um desativado não impede cadastrar de novo.
CREATE UNIQUE INDEX fornecedor_nome ON fornecedor (lower(btrim(nome))) WHERE ativo;
CREATE UNIQUE INDEX fornecedor_documento ON fornecedor (documento) WHERE documento IS NOT NULL AND ativo;

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
CREATE UNIQUE INDEX ingrediente_nome ON ingrediente (lower(btrim(nome))) WHERE ativo;

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
  nome            text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 40 AND nome !~ '[[:cntrl:]]'
                                       AND nome_de_unidade(nome) <> ''),
  quantidade_base numeric(14, 4) NOT NULL CHECK (quantidade_base > 0),
  ativo           boolean NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ingrediente_conversao_nome ON ingrediente_conversao (ingrediente_id, nome_de_unidade(nome)) WHERE ativo;

CREATE FUNCTION conversao_sem_equivalencia_errada() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  u        unidade_medida;
  base     unidade_medida;
  partes   text[];
  esperado numeric;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.ingrediente_id <> OLD.ingrediente_id THEN
    RAISE EXCEPTION 'A conversão não muda de ingrediente.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO base FROM unidade_medida WHERE codigo = (SELECT unidade_base FROM ingrediente WHERE id = NEW.ingrediente_id);
  SELECT * INTO u FROM unidade_padrao(NEW.nome);
  IF u.codigo IS NOT NULL AND u.grandeza = base.grandeza THEN
    RAISE EXCEPTION '"%" já é convertido sozinho (1 % = % %). Não cadastre outra equivalência.',
      btrim(NEW.nome), u.codigo, trim(trailing '.' FROM trim(trailing '0' FROM u.fator::text)), base.codigo
      USING ERRCODE = 'check_violation';
  END IF;
  -- Nome que já diz o tamanho ("saco 25 kg", "2 kg", "fardo 12 un") tem de valer exatamente
  -- isso: "saco 25 kg" = 2500 g é erro de digitação e é recusado.
  partes := regexp_match(lower(btrim(NEW.nome)), '([0-9]+(?:[.,][0-9]+)?)\s*([^0-9\s.,]+)\.?\s*$');
  IF partes IS NOT NULL THEN
    SELECT * INTO u FROM unidade_padrao(partes[2]);
    IF u.codigo IS NOT NULL AND u.grandeza = base.grandeza THEN
      esperado := replace(partes[1], ',', '.')::numeric * u.fator;
      IF NEW.quantidade_base <> esperado THEN
        RAISE EXCEPTION '"%" deveria valer % % (o tamanho está no nome).',
          btrim(NEW.nome), trim(trailing '.' FROM trim(trailing '0' FROM esperado::text)), base.codigo
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ingrediente_conversao_valida
  BEFORE INSERT OR UPDATE ON ingrediente_conversao
  FOR EACH ROW EXECUTE FUNCTION conversao_sem_equivalencia_errada();

-- Converte uma quantidade de qualquer unidade aceita para a unidade base do ingrediente.
-- Mesma grandeza: pelo fator padrão. Senão: pela conversão ativa do ingrediente. Sem caminho:
-- erro (nunca chuta). Quantidade vazia, zero ou negativa: erro (estorno é movimento próprio,
-- não conversão negativa). Resultado arredondado a 4 casas (meio para cima), a mesma precisão
-- em que tudo é guardado; se der zero, erro (quantidade pequena demais para a unidade).
-- É a ÚNICA conta de conversão do sistema: compra, ficha técnica e importação usam esta função.
CREATE FUNCTION para_unidade_base(p_ingrediente integer, p_quantidade numeric, p_unidade text) RETURNS numeric
LANGUAGE plpgsql STABLE AS $$
DECLARE
  base      unidade_medida;
  u         unidade_medida;
  fator     numeric;
  resultado numeric;
BEGIN
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'A quantidade precisa ser maior que zero.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT um.* INTO base FROM ingrediente i JOIN unidade_medida um ON um.codigo = i.unidade_base WHERE i.id = p_ingrediente;
  IF base.codigo IS NULL THEN
    RAISE EXCEPTION 'Ingrediente % não existe.', p_ingrediente USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO u FROM unidade_padrao(p_unidade);
  IF u.codigo IS NOT NULL AND u.grandeza = base.grandeza THEN
    fator := u.fator; -- a base (g, ml, un) tem fator 1
  ELSE
    SELECT c.quantidade_base INTO fator FROM ingrediente_conversao c
    WHERE c.ingrediente_id = p_ingrediente AND c.ativo AND nome_de_unidade(c.nome) = nome_de_unidade(p_unidade);
  END IF;
  IF fator IS NULL THEN
    RAISE EXCEPTION 'Não há conversão de "%" para %.', btrim(coalesce(p_unidade, '')), base.codigo USING ERRCODE = 'invalid_parameter_value';
  END IF;
  resultado := round(p_quantidade * fator, 4);
  IF resultado = 0 THEN
    RAISE EXCEPTION 'Quantidade pequena demais: dá menos de 0,0001 %.', base.codigo USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN resultado;
END $$;
