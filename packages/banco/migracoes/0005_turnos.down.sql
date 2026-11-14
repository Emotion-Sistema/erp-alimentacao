-- Reversão da 0005 (só desenvolvimento): esquece os turnos da equipe. Reverta junto o
-- código que usa estas funções (packages/dominio/src/avisos.ts e turnos.ts).
DROP FUNCTION IF EXISTS pessoa_no_turno(integer, timestamptz, timestamptz, timestamptz);
ALTER TABLE sessao DROP COLUMN IF EXISTS turno_ate;
DROP FUNCTION IF EXISTS fim_do_turno_da_entrada(integer, timestamptz);
DROP FUNCTION IF EXISTS fim_do_aviso(integer, timestamptz);
DROP FUNCTION IF EXISTS turno_em(integer, timestamptz);
DROP TABLE IF EXISTS turno;
DROP FUNCTION IF EXISTS turno_sem_sobrepor();
