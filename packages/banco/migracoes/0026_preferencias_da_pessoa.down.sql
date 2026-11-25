-- Reversão da 0026 (só desenvolvimento). Tira as preferências de tela; todos voltam ao claro com
-- letra normal. Reverta junto o código que as usa (packages/dominio/src/preferencias.ts).
ALTER TABLE usuario DROP COLUMN IF EXISTS letra;
ALTER TABLE usuario DROP COLUMN IF EXISTS tema;
