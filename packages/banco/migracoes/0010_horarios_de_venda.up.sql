-- 0010: categorias e horários de venda (RC-09 seção 2a; E07 parte 2, PR 1; decisão 0016). Só adiciona.
-- Três camadas, de fora para dentro; vale a interseção das três:
--   1. unidade: abre, último pedido da cozinha e fecha, por dia da semana (segunda fechado);
--   2. canal (loja ou delivery): janela própria por dia; sem linha = segue a unidade;
--   3. categoria em cada canal: janela própria por dia; sem linha = segue o canal.
-- A semana é o padrão (repete toda semana). Uma data especial (feriado, evento) troca o padrão
-- só naquele dia. A pausa manual tira um canal ou uma categoria de venda até ser retomada.
-- Horário sempre na hora local da unidade (unidade.fuso_horario). Sem virada de meia-noite:
-- a loja fecha às 23h30 (hipótese registrada na decisão 0016).

CREATE TABLE categoria (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome          text NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 40 AND nome !~ '[[:cntrl:]]'),
  descricao     text CHECK (length(descricao) <= 300),
  -- Ordem em que aparece no cardápio e nas listas (menor primeiro).
  ordem         integer NOT NULL DEFAULT 0 CHECK (ordem BETWEEN 0 AND 9999),
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX categoria_nome ON categoria (nome_de_unidade(nome)) WHERE ativo;

-- As linhas de produto da casa (CLAUDE.md), para não começar vazio. Todas editáveis.
INSERT INTO categoria (nome, ordem) VALUES
  ('Cafeteria', 10), ('Almoço', 20), ('Porções', 30), ('Hambúrgueres', 40), ('Salgados', 50), ('Bebidas', 60);

-- 1. Horário da unidade por dia da semana (1 = segunda ... 7 = domingo, como isodow).
CREATE TABLE horario_unidade (
  unidade_id    integer NOT NULL REFERENCES unidade (id),
  dia           smallint NOT NULL CHECK (dia BETWEEN 1 AND 7),
  aberta        boolean NOT NULL,
  abre          time,
  ultimo_pedido time, -- último pedido da cozinha, em qualquer canal
  fecha         time, -- a loja fecha (depois do último pedido)
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unidade_id, dia),
  CONSTRAINT horario_unidade_coerente CHECK (
    (NOT aberta AND abre IS NULL AND ultimo_pedido IS NULL AND fecha IS NULL)
    OR (aberta AND abre < ultimo_pedido AND ultimo_pedido <= fecha))
);

-- Semana padrão, com os dados do responsável (14/11/2026): segunda fechado; ter a qui abre 10h;
-- sex a dom 9h; último pedido da cozinha 23h; loja fecha 23h30. Toda unidade nova já nasce com ela
-- (gatilho abaixo); as que já existem recebem agora. Tudo editável na tela.
CREATE FUNCTION criar_semana_padrao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO horario_unidade (unidade_id, dia, aberta, abre, ultimo_pedido, fecha)
    SELECT NEW.id, d.dia, d.dia <> 1,
           CASE WHEN d.dia = 1 THEN NULL WHEN d.dia BETWEEN 2 AND 4 THEN time '10:00' ELSE time '09:00' END,
           CASE WHEN d.dia = 1 THEN NULL ELSE time '23:00' END,
           CASE WHEN d.dia = 1 THEN NULL ELSE time '23:30' END
    FROM generate_series(1, 7) AS d (dia)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER unidade_semana_padrao AFTER INSERT ON unidade FOR EACH ROW EXECUTE FUNCTION criar_semana_padrao();
-- As unidades que já existem (mesma conta do gatilho).
INSERT INTO horario_unidade (unidade_id, dia, aberta, abre, ultimo_pedido, fecha)
  SELECT u.id, d.dia, d.dia <> 1,
         CASE WHEN d.dia = 1 THEN NULL WHEN d.dia BETWEEN 2 AND 4 THEN time '10:00' ELSE time '09:00' END,
         CASE WHEN d.dia = 1 THEN NULL ELSE time '23:00' END,
         CASE WHEN d.dia = 1 THEN NULL ELSE time '23:30' END
  FROM unidade u CROSS JOIN generate_series(1, 7) AS d (dia);

-- Data especial da unidade (feriado, evento): troca o dia da semana só naquela data.
CREATE TABLE horario_unidade_data (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unidade_id    integer NOT NULL REFERENCES unidade (id),
  data          date NOT NULL,
  aberta        boolean NOT NULL,
  abre          time,
  ultimo_pedido time,
  fecha         time,
  motivo        text NOT NULL CHECK (length(btrim(motivo)) BETWEEN 2 AND 80),
  ativo         boolean NOT NULL DEFAULT true, -- cancelar = desativar (nada se apaga)
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT horario_unidade_data_coerente CHECK (
    (NOT aberta AND abre IS NULL AND ultimo_pedido IS NULL AND fecha IS NULL)
    OR (aberta AND abre < ultimo_pedido AND ultimo_pedido <= fecha))
);
CREATE UNIQUE INDEX horario_unidade_data_unica ON horario_unidade_data (unidade_id, data) WHERE ativo;

-- 2 e 3. Janela de venda por canal (categoria nula) ou por categoria num canal, por dia da semana.
-- modo: 'segue' (vale a camada de fora), 'fechado' (não vende nesse dia) ou 'aberto' (inicio a fim).
CREATE TABLE horario_venda (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unidade_id    integer NOT NULL REFERENCES unidade (id),
  canal         text NOT NULL CHECK (canal IN ('loja', 'delivery')),
  categoria_id  integer REFERENCES categoria (id),
  dia           smallint NOT NULL CHECK (dia BETWEEN 1 AND 7),
  modo          text NOT NULL CHECK (modo IN ('segue', 'fechado', 'aberto')),
  inicio        time,
  fim           time,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT horario_venda_coerente CHECK (
    (modo <> 'aberto' AND inicio IS NULL AND fim IS NULL) OR (modo = 'aberto' AND inicio < fim)),
  CONSTRAINT horario_venda_unico UNIQUE NULLS NOT DISTINCT (unidade_id, canal, categoria_id, dia)
);

-- Data especial de um canal ou de uma categoria num canal.
CREATE TABLE horario_venda_data (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unidade_id    integer NOT NULL REFERENCES unidade (id),
  canal         text NOT NULL CHECK (canal IN ('loja', 'delivery')),
  categoria_id  integer REFERENCES categoria (id),
  data          date NOT NULL,
  modo          text NOT NULL CHECK (modo IN ('fechado', 'aberto')),
  inicio        time,
  fim           time,
  motivo        text NOT NULL CHECK (length(btrim(motivo)) BETWEEN 2 AND 80),
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT horario_venda_data_coerente CHECK (
    (modo = 'fechado' AND inicio IS NULL AND fim IS NULL) OR (modo = 'aberto' AND inicio < fim))
);
CREATE UNIQUE INDEX horario_venda_data_unica ON horario_venda_data (unidade_id, canal, coalesce(categoria_id, 0), data) WHERE ativo;

-- Pausa manual: canal nulo = todos os canais; categoria nula = o canal inteiro.
-- Vale de `inicio` até `ate` (ou até alguém retomar). Retomar grava quem e quando.
CREATE TABLE pausa_venda (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unidade_id     integer NOT NULL REFERENCES unidade (id),
  canal          text CHECK (canal IN ('loja', 'delivery')),
  categoria_id   integer REFERENCES categoria (id),
  inicio         timestamptz NOT NULL DEFAULT now(),
  ate            timestamptz,
  motivo         text NOT NULL CHECK (length(btrim(motivo)) BETWEEN 2 AND 120),
  criada_por     integer NOT NULL REFERENCES usuario (id),
  encerrada_em   timestamptz,
  encerrada_por  integer REFERENCES usuario (id),
  CONSTRAINT pausa_venda_prazo CHECK (ate IS NULL OR ate > inicio),
  CONSTRAINT pausa_venda_encerrada CHECK ((encerrada_em IS NULL) = (encerrada_por IS NULL))
);
CREATE INDEX pausa_venda_aberta ON pausa_venda (unidade_id) WHERE encerrada_em IS NULL;

-- Pode vender agora? Uma linha: aberta, o motivo quando não (código, a tela traduz) e, se ainda
-- abre hoje, a hora em que abre ("disponível a partir das 11h"). Regra única: o servidor
-- (E12, pedidos) e as telas usam esta função; nada de copiar a conta.
-- Motivos: unidade_fechada, antes_de_abrir, cozinha_fechada, canal_fechado, categoria_fechada,
-- categoria_inativa, fora_do_horario, pausado.
CREATE FUNCTION situacao_de_venda(p_unidade integer, p_canal text, p_categoria integer, p_instante timestamptz)
RETURNS TABLE (aberta boolean, motivo text, abre_as timestamptz)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_fuso text; v_local timestamp; v_data date; v_hora time; v_dia smallint;
  u record; c record; k record;
  v_inicio time; v_fim time; v_pausa record;
BEGIN
  IF p_canal NOT IN ('loja', 'delivery') THEN
    RAISE EXCEPTION 'Canal desconhecido: %', p_canal USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT fuso_horario INTO v_fuso FROM unidade WHERE id = p_unidade;
  IF v_fuso IS NULL THEN
    RAISE EXCEPTION 'Unidade não encontrada.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_local := p_instante AT TIME ZONE v_fuso;
  v_data := v_local::date;
  v_hora := v_local::time;
  v_dia := extract(isodow FROM v_data)::smallint;

  IF p_categoria IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categoria WHERE id = p_categoria AND ativo) THEN
    RETURN QUERY SELECT false, 'categoria_inativa'::text, NULL::timestamptz; RETURN;
  END IF;

  -- 1. Unidade: a data especial vence o dia da semana.
  SELECT x.aberta, x.abre, x.ultimo_pedido INTO u FROM horario_unidade_data x
    WHERE x.unidade_id = p_unidade AND x.data = v_data AND x.ativo;
  IF NOT FOUND THEN
    SELECT x.aberta, x.abre, x.ultimo_pedido INTO u FROM horario_unidade x WHERE x.unidade_id = p_unidade AND x.dia = v_dia;
  END IF;
  IF NOT FOUND OR NOT u.aberta THEN
    RETURN QUERY SELECT false, 'unidade_fechada'::text, NULL::timestamptz; RETURN;
  END IF;
  v_inicio := u.abre;
  v_fim := u.ultimo_pedido;

  -- 2. Canal inteiro (categoria nula).
  SELECT x.modo, x.inicio, x.fim INTO c FROM horario_venda_data x
    WHERE x.unidade_id = p_unidade AND x.canal = p_canal AND x.categoria_id IS NULL AND x.data = v_data AND x.ativo;
  IF NOT FOUND THEN
    SELECT x.modo, x.inicio, x.fim INTO c FROM horario_venda x
      WHERE x.unidade_id = p_unidade AND x.canal = p_canal AND x.categoria_id IS NULL AND x.dia = v_dia;
  END IF;
  IF FOUND AND c.modo = 'fechado' THEN
    RETURN QUERY SELECT false, 'canal_fechado'::text, NULL::timestamptz; RETURN;
  ELSIF FOUND AND c.modo = 'aberto' THEN
    v_inicio := greatest(v_inicio, c.inicio);
    v_fim := least(v_fim, c.fim);
  END IF;

  -- 3. Categoria no canal.
  IF p_categoria IS NOT NULL THEN
    SELECT x.modo, x.inicio, x.fim INTO k FROM horario_venda_data x
      WHERE x.unidade_id = p_unidade AND x.canal = p_canal AND x.categoria_id = p_categoria AND x.data = v_data AND x.ativo;
    IF NOT FOUND THEN
      SELECT x.modo, x.inicio, x.fim INTO k FROM horario_venda x
        WHERE x.unidade_id = p_unidade AND x.canal = p_canal AND x.categoria_id = p_categoria AND x.dia = v_dia;
    END IF;
    IF FOUND AND k.modo = 'fechado' THEN
      RETURN QUERY SELECT false, 'categoria_fechada'::text, NULL::timestamptz; RETURN;
    ELSIF FOUND AND k.modo = 'aberto' THEN
      v_inicio := greatest(v_inicio, k.inicio);
      v_fim := least(v_fim, k.fim);
    END IF;
  END IF;

  -- Janela que sobrou (pode ficar vazia se as camadas não se cruzam).
  IF v_inicio >= v_fim OR v_hora >= v_fim THEN
    RETURN QUERY SELECT false,
      CASE WHEN v_inicio < v_fim AND v_fim = u.ultimo_pedido THEN 'cozinha_fechada' ELSE 'fora_do_horario' END::text,
      NULL::timestamptz;
    RETURN;
  END IF;
  IF v_hora < v_inicio THEN
    RETURN QUERY SELECT false,
      CASE WHEN v_inicio = u.abre THEN 'antes_de_abrir' ELSE 'fora_do_horario' END::text,
      (v_data + v_inicio) AT TIME ZONE v_fuso;
    RETURN;
  END IF;

  -- Pausa manual que vale agora (a que termina mais tarde manda; sem prazo vence todas).
  SELECT p.ate INTO v_pausa FROM pausa_venda p
    WHERE p.unidade_id = p_unidade AND p.encerrada_em IS NULL
      AND p.inicio <= p_instante AND (p.ate IS NULL OR p.ate > p_instante)
      AND (p.canal IS NULL OR p.canal = p_canal)
      AND (p.categoria_id IS NULL OR p.categoria_id = p_categoria)
    ORDER BY p.ate DESC NULLS FIRST LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT false, 'pausado'::text,
      CASE WHEN v_pausa.ate IS NOT NULL AND v_pausa.ate < (v_data + v_fim) AT TIME ZONE v_fuso THEN v_pausa.ate END;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text, NULL::timestamptz;
END $$;
