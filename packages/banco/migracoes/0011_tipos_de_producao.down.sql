-- Reversão da 0011 (só desenvolvimento): esquece os tipos de produção.
DROP TABLE IF EXISTS tipo_producao;
-- Reverta junto o código que usa esta tabela (packages/dominio/src/tipos-producao.ts e a tela
-- apps/gestao/app/cadastros/tipos-producao/).
