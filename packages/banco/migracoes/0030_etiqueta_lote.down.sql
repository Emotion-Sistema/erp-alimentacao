-- Desfaz a 0030. Atenção: apaga os códigos dos produtos e as etiquetas dos lotes (BAC-001...).
-- Aplicar de novo gera os códigos outra vez (podem sair diferentes se o cadastro mudou) e a
-- numeração recomeça: etiquetas já escritas nos pacotes deixam de ser reconhecidas. NÃO rodar em
-- produção depois que houver lotes etiquetados.
DROP TRIGGER IF EXISTS estoque_lote_etiqueta ON estoque_lote;
DROP TRIGGER IF EXISTS ficha_etiqueta ON ficha;
DROP TRIGGER IF EXISTS ingrediente_etiqueta ON ingrediente;
DROP FUNCTION IF EXISTS estoque_lote_etiquetar();
DROP TRIGGER IF EXISTS etiqueta_sequencia_avanca ON etiqueta_sequencia;
DROP FUNCTION IF EXISTS etiqueta_ao_cadastrar();
DROP FUNCTION IF EXISTS etiqueta_escolher(text);
DROP FUNCTION IF EXISTS etiqueta_candidatos(text);
DROP FUNCTION IF EXISTS etiqueta_palavras(text);
ALTER TABLE estoque_lote DROP COLUMN IF EXISTS etiqueta;
DROP TABLE IF EXISTS etiqueta_sequencia;
DROP TABLE IF EXISTS etiqueta_produto;
DROP FUNCTION IF EXISTS etiqueta_produto_dono_fixo();
DROP FUNCTION IF EXISTS etiqueta_sequencia_so_avanca();
