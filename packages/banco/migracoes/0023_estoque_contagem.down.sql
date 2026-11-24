-- Reversão da 0023 (só desenvolvimento): esquece as contagens.
ALTER TABLE estoque_movimento DROP COLUMN IF EXISTS contagem_id;
DROP TABLE IF EXISTS estoque_contagem_fim;
DROP TABLE IF EXISTS estoque_contagem_registro;
DROP TABLE IF EXISTS estoque_contagem_item;
DROP TABLE IF EXISTS estoque_contagem;
