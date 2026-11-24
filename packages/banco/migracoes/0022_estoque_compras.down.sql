-- Reversão da 0022 (só desenvolvimento): esquece as fotos das notas e o valor informado da correção.
-- A coluna está numa tabela imutável: o gatilho só barra UPDATE e DELETE de linhas, não ALTER.
DROP TRIGGER IF EXISTS estoque_movimento_correcao_certa ON estoque_movimento;
DROP TRIGGER IF EXISTS estoque_movimento_item_informado_certo ON estoque_movimento_item;
DROP FUNCTION IF EXISTS estoque_correcao_de_custo_certa();
ALTER TABLE estoque_movimento_item DROP COLUMN IF EXISTS valor_informado;
DROP TABLE IF EXISTS estoque_nota_foto;
DROP FUNCTION IF EXISTS estoque_nota_foto_da_entrada();
