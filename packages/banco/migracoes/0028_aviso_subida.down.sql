-- Desfaz a 0028 (só existe a tabela nova e o índice; nenhum dado de antes muda).
DROP INDEX IF EXISTS aviso_urgente_valendo;
DROP TABLE IF EXISTS aviso_subida;
