-- 0027: número escolhido de cada mesa (pedido do responsável, 25/11/2026: supervisor e acima escolhem
-- o número das mesas). Só adiciona.
-- A mesa é sempre a mesma pelo `codigo` (a posição na loja, fixa no código: packages/dominio/src/mesas.ts);
-- o número é só o nome que aparece na tela. Sem linha aqui, vale o número padrão.
-- Número único por unidade, conferido no fim da transação (DEFERRABLE): dá para trocar o número de
-- duas mesas entre si numa gravação só. Cada mudança fica na auditoria (mesas.numerar, com o antes e o
-- depois); a linha guarda quem mudou por último e quando.
CREATE TABLE mesa_numero (
  unidade_id     integer NOT NULL REFERENCES unidade(id),
  codigo         text NOT NULL CHECK (codigo ~ '^[a-z0-9_]{1,20}$'),
  numero         integer NOT NULL CHECK (numero BETWEEN 1 AND 999),
  atualizado_por integer NOT NULL REFERENCES usuario(id),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unidade_id, codigo),
  CONSTRAINT mesa_numero_unico UNIQUE (unidade_id, numero) DEFERRABLE INITIALLY DEFERRED
);
-- Nada é apagado (RC-17): a numeração muda, nunca some.
CREATE TRIGGER mesa_numero_nao_apaga BEFORE DELETE OR TRUNCATE ON mesa_numero
  FOR EACH STATEMENT EXECUTE FUNCTION recusar_alteracao();
