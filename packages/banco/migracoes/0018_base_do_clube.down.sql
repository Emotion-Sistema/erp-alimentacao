-- Reversão da 0018 (só desenvolvimento): esquece as regras do Clube. Não há dado de cliente aqui.
DROP FUNCTION IF EXISTS unidade_aberta_em(integer, timestamptz);
DROP TABLE IF EXISTS clube_campanha;
DROP TABLE IF EXISTS clube_presente;
DROP TABLE IF EXISTS clube_premio;
DROP TABLE IF EXISTS clube_horario_desconto;
DROP TABLE IF EXISTS clube_categoria;
DROP TABLE IF EXISTS clube_regras;
-- Reverta junto o código que usa estas tabelas (packages/dominio/src/clube*.ts).
