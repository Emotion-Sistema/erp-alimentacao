-- Reversão da 0006 (só desenvolvimento): esquece fornecedores, ingredientes e conversões.
-- Reverta junto o código que usa estas tabelas (packages/dominio/src/cadastros.ts).
DROP FUNCTION IF EXISTS para_unidade_base(integer, numeric, text);
DROP TABLE IF EXISTS ingrediente_conversao;
DROP FUNCTION IF EXISTS conversao_sem_equivalencia_errada();
DROP TABLE IF EXISTS ingrediente;
DROP FUNCTION IF EXISTS ingrediente_base_fixa();
DROP TABLE IF EXISTS fornecedor;
DROP FUNCTION IF EXISTS unidade_padrao(text);
DROP TABLE IF EXISTS unidade_medida;
DROP FUNCTION IF EXISTS nome_de_unidade(text);
