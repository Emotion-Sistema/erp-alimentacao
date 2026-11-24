-- Reversão da 0021 (só desenvolvimento): esquece todo o estoque (saldos e movimentos).
DROP FUNCTION IF EXISTS hoje_na_loja();
DROP TABLE IF EXISTS estoque_movimento_linha;
DROP TABLE IF EXISTS estoque_movimento_item;
DROP TABLE IF EXISTS estoque_saldo;
DROP TABLE IF EXISTS estoque_lote;
DROP TABLE IF EXISTS estoque_movimento;
DROP TABLE IF EXISTS estoque_item;
DROP FUNCTION IF EXISTS estoque_saldo_so_quantidade();
DROP FUNCTION IF EXISTS estoque_saldo_nao_some();
DROP FUNCTION IF EXISTS estoque_historico_imutavel();
DROP FUNCTION IF EXISTS estoque_item_de_preparo();
-- Reverta junto o código que usa estas tabelas (packages/dominio/src/estoque*.ts).
