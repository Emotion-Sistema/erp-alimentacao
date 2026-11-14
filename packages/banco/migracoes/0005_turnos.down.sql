-- Reversão da 0005 (só desenvolvimento): esquece os turnos da equipe.
DROP FUNCTION IF EXISTS pessoa_no_turno(integer, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS fim_do_aviso(integer, timestamptz);
DROP FUNCTION IF EXISTS turno_em(integer, timestamptz);
DROP TABLE IF EXISTS turno;
