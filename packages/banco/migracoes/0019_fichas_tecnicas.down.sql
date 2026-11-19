-- Reversão da 0019 (só desenvolvimento): esquece as fichas técnicas e o custo de referência.
DROP TABLE IF EXISTS ficha_config;
ALTER TABLE IF EXISTS ficha DROP CONSTRAINT IF EXISTS ficha_versao_atual;
DROP TABLE IF EXISTS ficha_pendencia;
DROP TABLE IF EXISTS ficha_item;
DROP TABLE IF EXISTS ficha_versao;
DROP TABLE IF EXISTS ficha;
DROP FUNCTION IF EXISTS ficha_historico_imutavel();
DROP FUNCTION IF EXISTS ficha_versao_da_ficha();
ALTER TABLE ingrediente DROP CONSTRAINT IF EXISTS ingrediente_custo_ref;
ALTER TABLE ingrediente DROP COLUMN IF EXISTS custo_ref_em, DROP COLUMN IF EXISTS custo_ref_quantidade,
  DROP COLUMN IF EXISTS custo_ref_centavos;
-- Reverta junto o código que usa estas tabelas (packages/dominio/src/fichas*.ts).
