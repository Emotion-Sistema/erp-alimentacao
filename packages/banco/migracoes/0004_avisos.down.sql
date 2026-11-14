-- Reversão da 0004 (SÓ desenvolvimento; nunca em produção): APAGA quem recebeu e quem
-- confirmou a leitura, e a autoria dos comunicados. Reaplicar não traz isso de volta.
DROP TABLE IF EXISTS aviso_destino;
DROP FUNCTION IF EXISTS aviso_destino_so_avanca();
DROP INDEX IF EXISTS aviso_entrega;
ALTER TABLE aviso
  DROP CONSTRAINT IF EXISTS aviso_operacional_tem_validade,
  DROP CONSTRAINT IF EXISTS aviso_comunicado_tem_autor,
  DROP COLUMN IF EXISTS prioridade,
  DROP COLUMN IF EXISTS natureza,
  DROP COLUMN IF EXISTS autor_id,
  DROP COLUMN IF EXISTS para_usuario_id,
  DROP COLUMN IF EXISTS expira_em;
