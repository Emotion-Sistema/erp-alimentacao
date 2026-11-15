-- Reversão da 0008 (só desenvolvimento).
ALTER TABLE ingrediente DROP CONSTRAINT IF EXISTS ingrediente_exibicao_da_familia;
DROP TRIGGER IF EXISTS ingrediente_exibicao_padrao ON ingrediente;
DROP FUNCTION IF EXISTS ingrediente_exibicao_padrao();
ALTER TABLE ingrediente DROP COLUMN IF EXISTS unidade_exibicao;
