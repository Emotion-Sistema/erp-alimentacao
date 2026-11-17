-- Reversão da 0010 (só desenvolvimento): esquece categorias e horários de venda.
-- Reverta junto o código que usa estas tabelas (packages/dominio/src/horarios.ts).
DROP FUNCTION IF EXISTS situacao_de_venda(integer, text, integer, timestamptz);
DROP TABLE IF EXISTS pausa_venda;
DROP TABLE IF EXISTS horario_venda_data;
DROP TABLE IF EXISTS horario_venda;
DROP TABLE IF EXISTS horario_unidade_data;
DROP TRIGGER IF EXISTS unidade_semana_padrao ON unidade;
DROP FUNCTION IF EXISTS criar_semana_padrao();
DROP TABLE IF EXISTS horario_unidade;
DROP TABLE IF EXISTS categoria;
