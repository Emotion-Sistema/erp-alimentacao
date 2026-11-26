-- 0029: avisos de desperdício por vencimento (ideia nº 15: D1, D7 e D4a; RC-09 "Lote perto do
-- vencimento"; decisão 0029). Só adiciona: uma tabela nova e uma coluna opcional.

-- Um aviso de validade por lote, área e tipo: "perto do vencimento" (D1) e "vencido ainda no
-- estoque sem perda registrada" (D7). A chave primária garante que cada lote avisa uma vez só em
-- cada área, mesmo com duas execuções do worker ao mesmo tempo.
CREATE TABLE estoque_lote_aviso (
  lote_id  integer NOT NULL REFERENCES estoque_lote(id),
  area     text NOT NULL CHECK (area IN ('cozinha', 'bebidas_salao', 'cafeteria', 'sorvete')),
  tipo     text NOT NULL CHECK (tipo IN ('perto_do_vencimento', 'vencido_sem_perda')),
  aviso_id bigint NOT NULL UNIQUE REFERENCES aviso(id),
  em       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lote_id, area, tipo)
);
-- Nada é apagado nem muda (RC-17).
CREATE TRIGGER estoque_lote_aviso_so_insercao
  BEFORE UPDATE OR DELETE ON estoque_lote_aviso
  FOR EACH ROW EXECUTE FUNCTION recusar_alteracao();
CREATE TRIGGER estoque_lote_aviso_sem_truncate
  BEFORE TRUNCATE ON estoque_lote_aviso
  FOR EACH STATEMENT EXECUTE FUNCTION recusar_alteracao();

-- D4a: validade mínima na entrada, em dias (opcional, por ingrediente). Nulo = sem alerta.
ALTER TABLE ingrediente ADD COLUMN validade_minima_dias smallint
  CHECK (validade_minima_dias IS NULL OR validade_minima_dias BETWEEN 1 AND 365);
