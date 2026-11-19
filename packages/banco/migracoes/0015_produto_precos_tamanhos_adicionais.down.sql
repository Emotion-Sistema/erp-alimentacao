-- Reversão da 0015 (só desenvolvimento): esquece preço do delivery, tamanhos e adicionais.
DROP TABLE IF EXISTS produto_grupo_adicional;
DROP TABLE IF EXISTS adicional;
DROP TABLE IF EXISTS grupo_adicional;
DROP TABLE IF EXISTS produto_tamanho;
ALTER TABLE produto DROP COLUMN IF EXISTS preco_delivery_centavos;
-- Reverta junto o código que usa estas tabelas (packages/dominio/src/produtos.ts e adicionais.ts).
