-- Reversão da 0025 (só desenvolvimento). Apaga as linhas de reposição, o estado e os eventos (os
-- avisos já enviados ficam na central). Os movimentos de estoque não mudam.
-- Reverta junto o código que usa estas tabelas (packages/dominio/src/estoque-reposicao*.ts e a
-- chamada em Lancamento.fechar, em estoque.ts).
DROP TABLE IF EXISTS estoque_reposicao_evento;
DROP TABLE IF EXISTS estoque_reposicao_estado;
DROP TABLE IF EXISTS estoque_linha_mudanca;
DROP TABLE IF EXISTS estoque_linha;
DROP FUNCTION IF EXISTS estoque_linha_registrar();
