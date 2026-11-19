-- Reversão da 0016 (só desenvolvimento): esquece as fotos dos produtos.
DROP TABLE IF EXISTS produto_foto;
-- Reverta junto o código que usa esta tabela (packages/dominio/src/fotos.ts).
