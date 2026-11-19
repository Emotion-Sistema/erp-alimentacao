-- Reversão da 0017 (só desenvolvimento): esquece os combos.
DROP TABLE IF EXISTS combo_opcao;
DROP TABLE IF EXISTS combo_parte;
ALTER TABLE produto DROP CONSTRAINT IF EXISTS produto_combo_sem_producao;
ALTER TABLE produto DROP COLUMN IF EXISTS combo;
-- Reverta junto o código que usa estas tabelas (packages/dominio/src/produtos.ts e combos).
