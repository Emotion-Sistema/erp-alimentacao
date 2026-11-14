-- Reversão da 0004 (só desenvolvimento): esquece quem recebeu e leu os avisos.
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
