-- Reversão da 0009 (só desenvolvimento).
DROP TRIGGER IF EXISTS ingrediente_conversao_modelo ON ingrediente_conversao;
DROP FUNCTION IF EXISTS conversao_ligada_ao_modelo();
DROP INDEX IF EXISTS ingrediente_conversao_modelo;
ALTER TABLE ingrediente_conversao DROP COLUMN IF EXISTS modelo_id;
DROP TABLE IF EXISTS embalagem_modelo;
DROP FUNCTION IF EXISTS embalagem_modelo_fixo_se_usado();
DROP FUNCTION IF EXISTS nome_do_modelo(text, numeric, text);
