-- Reversão da 0012 (só desenvolvimento): esquece os produtos.
DROP TABLE IF EXISTS produto;
-- Reverta junto o código que usa esta tabela (packages/dominio/src/produtos.ts e a tela
-- apps/gestao/app/cadastros/produtos/).
