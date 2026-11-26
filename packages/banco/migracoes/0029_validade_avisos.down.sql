-- Desfaz a 0029 (só existe a tabela nova e a coluna opcional; nenhum dado de antes muda).
-- Atenção: apaga as validades mínimas já cadastradas nos ingredientes (só configuração) e as marcas
-- de "lote já avisado": aplicar de novo deixa os lotes avisarem outra vez.
ALTER TABLE ingrediente DROP COLUMN IF EXISTS validade_minima_dias;
DROP TABLE IF EXISTS estoque_lote_aviso;
