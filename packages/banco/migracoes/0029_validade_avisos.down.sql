-- Desfaz a 0029 (só existe a tabela nova e a coluna opcional; nenhum dado de antes muda).
ALTER TABLE ingrediente DROP COLUMN IF EXISTS validade_minima_dias;
DROP TABLE IF EXISTS estoque_lote_aviso;
