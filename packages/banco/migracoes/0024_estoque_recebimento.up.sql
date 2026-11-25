-- 0024: quem recebe confirma (E09; decisão 0027, item 9; decisão do responsável em 25/11/2026). Só
-- amplia e adiciona.
-- Na transferência ENTRE ÁREAS, o item sai da origem e fica na área de destino num local novo,
-- "a receber": não é livre para venda, não é consumido, não entra em contagem e não muda de lugar
-- por outro caminho. Quem foi indicado (ou a supervisão/gestão daquela área) confirma, escolhendo
-- em uso ou guardado, ou recusa com o motivo, e o item volta aos mesmos lotes, área e local de
-- onde saiu. Cada recebimento termina uma vez só. Nada muda nem some (RC-17).

ALTER TABLE estoque_saldo DROP CONSTRAINT estoque_saldo_local_check;
ALTER TABLE estoque_saldo ADD CONSTRAINT estoque_saldo_local_check CHECK (local IN ('em_uso', 'guardado', 'a_receber'));
ALTER TABLE estoque_movimento_linha DROP CONSTRAINT estoque_movimento_linha_local_check;
ALTER TABLE estoque_movimento_linha ADD CONSTRAINT estoque_movimento_linha_local_check CHECK (local IN ('em_uso', 'guardado', 'a_receber'));
-- O que está a receber nunca é bloqueado (bloquear é coisa de quem já recebeu).
ALTER TABLE estoque_saldo ADD CONSTRAINT estoque_saldo_a_receber_livre CHECK (local <> 'a_receber' OR NOT bloqueado);
ALTER TABLE estoque_movimento_linha ADD CONSTRAINT estoque_movimento_linha_a_receber_livre CHECK (local <> 'a_receber' OR NOT bloqueado);

-- Uma transferência entre áreas = um recebimento pendente (até ter o fim).
CREATE TABLE estoque_recebimento (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- A transferência que pôs o item "a receber".
  movimento_id   bigint NOT NULL UNIQUE REFERENCES estoque_movimento (id),
  item_id        integer NOT NULL REFERENCES estoque_item (id),
  area_origem    text NOT NULL CHECK (area_origem IN ('cozinha', 'bebidas_salao', 'cafeteria', 'sorvete')),
  local_origem   text NOT NULL CHECK (local_origem IN ('em_uso', 'guardado')),
  area_destino   text NOT NULL CHECK (area_destino IN ('cozinha', 'bebidas_salao', 'cafeteria', 'sorvete')),
  -- O local que quem mandou escolheu: só sugestão (quem recebe decide).
  local_sugerido text NOT NULL CHECK (local_sugerido IN ('em_uso', 'guardado')),
  quantidade     numeric(16, 4) NOT NULL CHECK (quantidade > 0),
  -- Quem foi indicado para receber (cuida da área de destino).
  recebido_por   integer NOT NULL REFERENCES usuario (id),
  criado_em      timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT estoque_recebimento_outra_area CHECK (area_origem <> area_destino)
);
CREATE INDEX estoque_recebimento_destino ON estoque_recebimento (area_destino, id);
CREATE INDEX estoque_recebimento_item ON estoque_recebimento (item_id);

-- Fim do recebimento: confirmado (com o local escolhido) ou recusado (com o motivo). Uma vez só.
CREATE TABLE estoque_recebimento_fim (
  recebimento_id integer PRIMARY KEY REFERENCES estoque_recebimento (id),
  situacao       text NOT NULL CHECK (situacao IN ('confirmado', 'recusado')),
  -- A transferência que tirou do "a receber" (para o local escolhido ou de volta à origem).
  movimento_id   bigint NOT NULL UNIQUE REFERENCES estoque_movimento (id),
  local          text CHECK (local IN ('em_uso', 'guardado')),
  observacao     text CHECK (length(btrim(observacao)) BETWEEN 1 AND 500 AND observacao !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'),
  por            integer NOT NULL REFERENCES usuario (id),
  em             timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT estoque_recebimento_fim_local CHECK ((situacao = 'confirmado') = (local IS NOT NULL)),
  CONSTRAINT estoque_recebimento_fim_motivo CHECK (situacao = 'confirmado' OR observacao IS NOT NULL)
);

-- Os dois movimentos ligados ao recebimento são transferências.
CREATE FUNCTION estoque_recebimento_de_transferencia() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM estoque_movimento WHERE id = NEW.movimento_id AND tipo = 'transferencia') THEN
    RAISE EXCEPTION 'O recebimento é de uma transferência.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER estoque_recebimento_transferencia BEFORE INSERT ON estoque_recebimento
  FOR EACH ROW EXECUTE FUNCTION estoque_recebimento_de_transferencia();
CREATE TRIGGER estoque_recebimento_fim_transferencia BEFORE INSERT ON estoque_recebimento_fim
  FOR EACH ROW EXECUTE FUNCTION estoque_recebimento_de_transferencia();

CREATE TRIGGER estoque_recebimento_imutavel BEFORE UPDATE OR DELETE ON estoque_recebimento
  FOR EACH ROW EXECUTE FUNCTION estoque_historico_imutavel();
CREATE TRIGGER estoque_recebimento_fim_imutavel BEFORE UPDATE OR DELETE ON estoque_recebimento_fim
  FOR EACH ROW EXECUTE FUNCTION estoque_historico_imutavel();
CREATE TRIGGER estoque_recebimento_sem_truncate BEFORE TRUNCATE ON estoque_recebimento
  FOR EACH STATEMENT EXECUTE FUNCTION recusar_alteracao();
CREATE TRIGGER estoque_recebimento_fim_sem_truncate BEFORE TRUNCATE ON estoque_recebimento_fim
  FOR EACH STATEMENT EXECUTE FUNCTION recusar_alteracao();
