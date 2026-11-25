-- 0025: linhas de reposição e estado do item por área (E10 parte 1; RC-09 seções 3 e 4; decisão
-- 0029). Só adiciona.
-- LINHAS (por item de estoque e área): saudável e emergência sobre o total livre (em uso +
-- guardado, sem bloqueado, vencido nem "a receber"), e o nível de abastecimento do em uso. Todas
-- opcionais, em decimal exato com 4 casas, na unidade do estoque. Cada mudança fica no histórico
-- (gatilho), com quem mudou e quando; a linha atual não se apaga (zera-se com nulos).
-- ESTADO (por item e área): a situação de reposição em que o item está agora (saudável, repor,
-- emergência, esgotado), mais "usando guardado" e "precisa abastecer". É o que garante UM aviso por
-- cruzamento: só avisa de novo quando o item se recupera e cai outra vez. Muda na mesma transação
-- do movimento de estoque (sob a trava do item). Cada mudança de estado fica num evento imutável,
-- ligado ao movimento e ao aviso que gerou.

CREATE TABLE estoque_linha (
  item_id           integer NOT NULL REFERENCES estoque_item (id),
  area              text NOT NULL CHECK (area IN ('cozinha', 'bebidas_salao', 'cafeteria', 'sorvete')),
  saudavel          numeric(16, 4) CHECK (saudavel >= 0),
  emergencia        numeric(16, 4) CHECK (emergencia >= 0),
  -- Nível de abastecimento do EM USO: abaixo dele, trazer do guardado (não é compra).
  abastecimento     numeric(16, 4) CHECK (abastecimento >= 0),
  -- Aviso "começou a usar o guardado" para os gerentes gerais: urgente, normal (rebaixado) ou
  -- desligado (item que tem pouco em uso por natureza; RC-09 seção 4).
  aviso_guardado    text NOT NULL DEFAULT 'urgente' CHECK (aviso_guardado IN ('urgente', 'normal', 'desligado')),
  alterado_por      integer NOT NULL REFERENCES usuario (id),
  alterado_em       timestamptz NOT NULL DEFAULT clock_timestamp(),
  observacao        text CHECK (length(btrim(observacao)) BETWEEN 1 AND 500 AND observacao !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'),
  PRIMARY KEY (item_id, area),
  CONSTRAINT estoque_linha_emergencia_ate_saudavel CHECK (emergencia IS NULL OR saudavel IS NULL OR emergencia <= saudavel)
);

-- Histórico das linhas: cada inserção ou mudança da linha atual vira uma linha aqui (gatilho).
CREATE TABLE estoque_linha_mudanca (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id        integer NOT NULL REFERENCES estoque_item (id),
  area           text NOT NULL,
  saudavel       numeric(16, 4),
  emergencia     numeric(16, 4),
  abastecimento  numeric(16, 4),
  aviso_guardado text NOT NULL,
  observacao     text,
  por            integer NOT NULL REFERENCES usuario (id),
  em             timestamptz NOT NULL
);
CREATE INDEX estoque_linha_mudanca_item ON estoque_linha_mudanca (item_id, area, id);

CREATE FUNCTION estoque_linha_registrar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.item_id, NEW.area) IS DISTINCT FROM (OLD.item_id, OLD.area) THEN
    RAISE EXCEPTION 'A linha de reposição não muda de item nem de área.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO estoque_linha_mudanca (item_id, area, saudavel, emergencia, abastecimento, aviso_guardado, observacao, por, em)
  VALUES (NEW.item_id, NEW.area, NEW.saudavel, NEW.emergencia, NEW.abastecimento, NEW.aviso_guardado, NEW.observacao, NEW.alterado_por, NEW.alterado_em);
  RETURN NEW;
END $$;
CREATE TRIGGER estoque_linha_historico AFTER INSERT OR UPDATE ON estoque_linha
  FOR EACH ROW EXECUTE FUNCTION estoque_linha_registrar();
CREATE TRIGGER estoque_linha_sem_apagar BEFORE DELETE ON estoque_linha
  FOR EACH ROW EXECUTE FUNCTION estoque_historico_imutavel();
CREATE TRIGGER estoque_linha_sem_truncate BEFORE TRUNCATE ON estoque_linha
  FOR EACH STATEMENT EXECUTE FUNCTION recusar_alteracao();
CREATE TRIGGER estoque_linha_mudanca_imutavel BEFORE UPDATE OR DELETE ON estoque_linha_mudanca
  FOR EACH ROW EXECUTE FUNCTION estoque_historico_imutavel();
CREATE TRIGGER estoque_linha_mudanca_sem_truncate BEFORE TRUNCATE ON estoque_linha_mudanca
  FOR EACH STATEMENT EXECUTE FUNCTION recusar_alteracao();

-- Estado atual de reposição do item na área (muda; o histórico fica nos eventos).
CREATE TABLE estoque_reposicao_estado (
  item_id         integer NOT NULL REFERENCES estoque_item (id),
  area            text NOT NULL CHECK (area IN ('cozinha', 'bebidas_salao', 'cafeteria', 'sorvete')),
  situacao        text NOT NULL CHECK (situacao IN ('saudavel', 'repor', 'emergencia', 'esgotado')),
  usando_guardado boolean NOT NULL DEFAULT false,
  -- Em uso abaixo do nível de abastecimento (ou usando o guardado) e há guardado para trazer.
  abastecer       boolean NOT NULL DEFAULT false,
  -- Como estava na última avaliação (livre, sem bloqueado, vencido nem "a receber").
  quantidade      numeric(16, 4) NOT NULL CHECK (quantidade >= 0),
  em_uso          numeric(16, 4) NOT NULL CHECK (em_uso >= 0),
  guardado        numeric(16, 4) NOT NULL CHECK (guardado >= 0),
  -- Dia (na loja) da última avaliação: vencido é "validade antes deste dia".
  dia             date NOT NULL,
  movimento_id    bigint REFERENCES estoque_movimento (id),
  atualizado_em   timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (item_id, area),
  CONSTRAINT estoque_reposicao_estado_soma CHECK (quantidade = em_uso + guardado)
);
CREATE INDEX estoque_reposicao_estado_situacao ON estoque_reposicao_estado (situacao, area) WHERE situacao <> 'saudavel';
CREATE TRIGGER estoque_reposicao_estado_sem_apagar BEFORE DELETE ON estoque_reposicao_estado
  FOR EACH ROW EXECUTE FUNCTION estoque_historico_imutavel();
CREATE TRIGGER estoque_reposicao_estado_sem_truncate BEFORE TRUNCATE ON estoque_reposicao_estado
  FOR EACH STATEMENT EXECUTE FUNCTION recusar_alteracao();

-- Cada mudança de estado (e o aviso que gerou, se gerou). Nada muda nem some.
CREATE TABLE estoque_reposicao_evento (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id      integer NOT NULL REFERENCES estoque_item (id),
  area         text NOT NULL CHECK (area IN ('cozinha', 'bebidas_salao', 'cafeteria', 'sorvete')),
  tipo         text NOT NULL CHECK (tipo IN ('situacao', 'usando_guardado', 'abastecer')),
  -- Situação: de/para; usando_guardado e abastecer: 'sim' / 'nao'.
  de           text NOT NULL,
  para         text NOT NULL,
  quantidade   numeric(16, 4) NOT NULL,
  em_uso       numeric(16, 4) NOT NULL,
  -- O movimento que mudou o saldo (nulo quando foi a mudança da linha).
  movimento_id bigint REFERENCES estoque_movimento (id),
  aviso_id     bigint REFERENCES aviso (id),
  em           timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT estoque_reposicao_evento_mudou CHECK (de <> para)
);
CREATE INDEX estoque_reposicao_evento_item ON estoque_reposicao_evento (item_id, area, id);
CREATE UNIQUE INDEX estoque_reposicao_evento_aviso ON estoque_reposicao_evento (aviso_id) WHERE aviso_id IS NOT NULL;
CREATE TRIGGER estoque_reposicao_evento_imutavel BEFORE UPDATE OR DELETE ON estoque_reposicao_evento
  FOR EACH ROW EXECUTE FUNCTION estoque_historico_imutavel();
CREATE TRIGGER estoque_reposicao_evento_sem_truncate BEFORE TRUNCATE ON estoque_reposicao_evento
  FOR EACH STATEMENT EXECUTE FUNCTION recusar_alteracao();
