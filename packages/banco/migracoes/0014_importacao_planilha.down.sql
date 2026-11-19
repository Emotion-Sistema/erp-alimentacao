-- Reversão da 0014 (só desenvolvimento): esquece o registro das importações. Os ingredientes e
-- produtos importados continuam (são cadastros comuns) e a auditoria de cada um também.
-- Reverta junto o código que usa esta tabela (packages/dominio/src/importar.ts e a tela
-- apps/gestao/app/cadastros/importar/).
DROP TABLE IF EXISTS importacao_planilha;
