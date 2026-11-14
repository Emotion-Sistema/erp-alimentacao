-- Reversão da 0003 (só desenvolvimento). Volta o padrão de 23h30 e esquece as prorrogações.
DROP FUNCTION IF EXISTS fim_do_turno(integer, timestamptz);
ALTER TABLE estacao_presenca DROP COLUMN IF EXISTS prorrogacoes;
UPDATE unidade SET fim_turno = '23:30' WHERE fim_turno = '00:30';
ALTER TABLE unidade ALTER COLUMN fim_turno SET DEFAULT '23:30';
