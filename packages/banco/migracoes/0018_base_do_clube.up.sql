-- 0018: base do Clube E-MOTION na gestão (RC-21 seção 2; passo 4 do plano de 19/11/2026;
-- decisão 0024). Só adiciona. Aqui ficam só as REGRAS que a equipe configura: desconto do
-- aplicativo, categorias, teto, horários, pontos, prêmios, presentes e campanhas. A conta do
-- cliente, o envio de notificações e a aplicação do desconto no pedido vêm na E26 e logo depois;
-- nenhum dado de cliente entra nesta migração. Todos os valores iniciais são hipóteses editáveis
-- (o responsável ainda vai responder percentual, pontos e prêmios) e o Clube nasce DESLIGADO.

-- Regras gerais: uma linha só (id = 1).
CREATE TABLE clube_regras (
  id                     smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ligado                 boolean NOT NULL DEFAULT false,
  -- Desconto do aplicativo em pontos-base: 1000 = 10,00%. Máximo 50%.
  desconto_pb            integer NOT NULL DEFAULT 1000 CHECK (desconto_pb BETWEEN 0 AND 5000),
  -- Verdadeiro: vale em todas as categorias; falso: só nas marcadas em clube_categoria.
  todas_as_categorias    boolean NOT NULL DEFAULT true,
  -- Teto do desconto por pedido, em centavos. Nulo = sem teto.
  teto_desconto_centavos integer CHECK (teto_desconto_centavos BETWEEN 1 AND 999999),
  -- Pontos que cada real pago soma (0 = Clube sem pontos).
  pontos_por_real        integer NOT NULL DEFAULT 1 CHECK (pontos_por_real BETWEEN 0 AND 100),
  -- Limite de campanhas por semana (segunda a domingo), para não incomodar.
  campanhas_por_semana   smallint NOT NULL DEFAULT 2 CHECK (campanhas_por_semana BETWEEN 1 AND 7),
  atualizado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_por         integer REFERENCES usuario (id)
);
INSERT INTO clube_regras (id) VALUES (1);

-- Categorias em que o desconto do aplicativo vale (quando todas_as_categorias = falso).
CREATE TABLE clube_categoria (
  categoria_id  integer PRIMARY KEY REFERENCES categoria (id),
  ativo         boolean NOT NULL DEFAULT true, -- tirar = desativar (nada se apaga)
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Horário do desconto por dia da semana (1 = segunda ... 7 = domingo). Sempre dentro do
-- horário de venda; 'todo_horario' = enquanto a casa vende; 'sem_desconto' = não vale no dia.
CREATE TABLE clube_horario_desconto (
  dia           smallint PRIMARY KEY CHECK (dia BETWEEN 1 AND 7),
  modo          text NOT NULL CHECK (modo IN ('todo_horario', 'sem_desconto', 'janela')),
  inicio        time,
  fim           time,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clube_horario_coerente CHECK (
    (modo <> 'janela' AND inicio IS NULL AND fim IS NULL) OR (modo = 'janela' AND inicio < fim))
);
INSERT INTO clube_horario_desconto (dia, modo) SELECT d, 'todo_horario' FROM generate_series(1, 7) AS d;

-- Catálogo de prêmios: o cliente troca pontos por um prêmio (ligado a um produto, opcional).
CREATE TABLE clube_premio (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome          text NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 60 AND nome !~ '[[:cntrl:]]'),
  descricao     text CHECK (length(descricao) <= 200 AND descricao !~ '[[:cntrl:]]'),
  pontos        integer NOT NULL CHECK (pontos BETWEEN 1 AND 100000),
  produto_id    integer REFERENCES produto (id),
  ordem         integer NOT NULL DEFAULT 0 CHECK (ordem BETWEEN 0 AND 99999),
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX clube_premio_nome ON clube_premio (nome_de_unidade(nome)) WHERE ativo;

-- Presentes automáticos: boas-vindas (primeiro pedido), aniversário (no mês) e "sentimos sua
-- falta" (depois de N dias sem pedir). Cada um ligado ou desligado, com um benefício:
--   desconto_percentual (valor em pontos-base), desconto_valor (centavos), produto (um item
--   grátis) ou pontos (pontos extras). validade_dias: quanto tempo o cliente tem para usar.
CREATE TABLE clube_presente (
  tipo           text PRIMARY KEY CHECK (tipo IN ('boas_vindas', 'aniversario', 'sentimos_falta')),
  ligado         boolean NOT NULL DEFAULT false,
  beneficio      text NOT NULL CHECK (beneficio IN ('desconto_percentual', 'desconto_valor', 'produto', 'pontos')),
  valor          integer,
  produto_id     integer REFERENCES produto (id),
  dias_sem_pedir smallint,
  validade_dias  smallint NOT NULL DEFAULT 30 CHECK (validade_dias BETWEEN 1 AND 90),
  mensagem       text CHECK (length(mensagem) <= 140 AND mensagem !~ '[[:cntrl:]]'),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por integer REFERENCES usuario (id),
  CONSTRAINT clube_presente_beneficio CHECK (
    (beneficio = 'desconto_percentual' AND valor BETWEEN 1 AND 10000 AND produto_id IS NULL)
    OR (beneficio = 'desconto_valor' AND valor BETWEEN 1 AND 999999 AND produto_id IS NULL)
    OR (beneficio = 'pontos' AND valor BETWEEN 1 AND 100000 AND produto_id IS NULL)
    OR (beneficio = 'produto' AND valor IS NULL AND produto_id IS NOT NULL)),
  CONSTRAINT clube_presente_dias CHECK (
    (tipo = 'sentimos_falta' AND dias_sem_pedir BETWEEN 7 AND 365)
    OR (tipo <> 'sentimos_falta' AND dias_sem_pedir IS NULL))
);
INSERT INTO clube_presente (tipo, beneficio, valor, dias_sem_pedir) VALUES
  ('boas_vindas', 'desconto_percentual', 1000, NULL),
  ('aniversario', 'desconto_percentual', 1500, NULL),
  ('sentimos_falta', 'desconto_percentual', 1000, 30);

-- Campanhas: só por notificação do aplicativo (RC-21). Aqui a equipe agenda; o envio de verdade
-- (só para quem aceitou ofertas) entra com o aplicativo do cliente (E26 e depois). Nada se apaga:
-- desistir = cancelar, com motivo. enviar_em precisa cair no horário da casa (unidade aberta) e
-- respeitar o limite por semana; o servidor confere sob trava.
CREATE TABLE clube_campanha (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unidade_id      integer NOT NULL REFERENCES unidade (id), -- de quem é o horário da casa
  titulo          text NOT NULL CHECK (length(btrim(titulo)) BETWEEN 2 AND 50 AND titulo !~ '[[:cntrl:]]'),
  texto           text NOT NULL CHECK (length(btrim(texto)) BETWEEN 2 AND 180 AND texto !~ '[[:cntrl:]]'),
  publico         text NOT NULL CHECK (publico IN ('todos', 'aniversariantes_do_mes', 'sem_pedir_30_dias')),
  enviar_em       timestamptz NOT NULL,
  situacao        text NOT NULL DEFAULT 'agendada' CHECK (situacao IN ('agendada', 'cancelada', 'enviada')),
  criada_por      integer NOT NULL REFERENCES usuario (id),
  criada_em       timestamptz NOT NULL DEFAULT now(),
  atualizada_em   timestamptz NOT NULL DEFAULT now(),
  cancelada_por   integer REFERENCES usuario (id),
  cancelada_em    timestamptz,
  motivo_cancelamento text CHECK (length(btrim(motivo_cancelamento)) BETWEEN 2 AND 120),
  enviada_em      timestamptz,
  destinatarios   integer CHECK (destinatarios >= 0),
  CONSTRAINT clube_campanha_cancelada CHECK (
    (situacao = 'cancelada') = (cancelada_em IS NOT NULL)
    AND (cancelada_em IS NULL) = (cancelada_por IS NULL)
    AND (cancelada_em IS NULL) = (motivo_cancelamento IS NULL)),
  CONSTRAINT clube_campanha_enviada CHECK (
    (situacao = 'enviada') = (enviada_em IS NOT NULL) AND (enviada_em IS NULL) = (destinatarios IS NULL))
);
CREATE INDEX clube_campanha_quando ON clube_campanha (enviar_em) WHERE situacao <> 'cancelada';

-- A casa está aberta neste instante? (abre <= hora < fecha, data especial vence o dia da semana.)
-- Regra única para "envio só nos horários da casa"; usa as mesmas tabelas da 0010.
CREATE FUNCTION unidade_aberta_em(p_unidade integer, p_instante timestamptz)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE v_fuso text; v_local timestamp; u record;
BEGIN
  IF p_instante IS NULL THEN RETURN false; END IF;
  SELECT fuso_horario INTO v_fuso FROM unidade WHERE id = p_unidade;
  IF v_fuso IS NULL THEN RETURN false; END IF;
  v_local := p_instante AT TIME ZONE v_fuso;
  SELECT x.aberta, x.abre, x.fecha INTO u FROM horario_unidade_data x
    WHERE x.unidade_id = p_unidade AND x.data = v_local::date AND x.ativo;
  IF NOT FOUND THEN
    SELECT x.aberta, x.abre, x.fecha INTO u FROM horario_unidade x
      WHERE x.unidade_id = p_unidade AND x.dia = extract(isodow FROM v_local::date);
  END IF;
  RETURN FOUND AND u.aberta AND v_local::time >= u.abre AND v_local::time < u.fecha;
END $$;
