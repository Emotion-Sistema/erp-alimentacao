-- Reversão da 0022 (só desenvolvimento): esquece as fotos das notas e o valor informado da correção.
-- A coluna está numa tabela imutável: o gatilho só barra UPDATE e DELETE de linhas, não ALTER.
ALTER TABLE estoque_movimento_item DROP COLUMN IF EXISTS valor_informado;
DROP TABLE IF EXISTS estoque_nota_foto;
DROP FUNCTION IF EXISTS estoque_nota_foto_da_entrada();
