-- Reversão da 0020 (só desenvolvimento): esquece os alergênicos e a conferência dos ingredientes.
ALTER TABLE ingrediente DROP CONSTRAINT IF EXISTS ingrediente_alergenicos_conferidos;
ALTER TABLE ingrediente DROP COLUMN IF EXISTS alergenicos_conferidos_por, DROP COLUMN IF EXISTS alergenicos_conferidos_em;
DROP TABLE IF EXISTS ingrediente_alergenico;
DROP TABLE IF EXISTS alergenico;
-- Reverta junto o código que usa estas tabelas (packages/dominio/src/alergenicos.ts).
