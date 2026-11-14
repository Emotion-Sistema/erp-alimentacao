-- 0005: turnos da equipe (resposta do responsável, 14/11/2026; decisão 0013 revista).
-- Turno 1: 08h às 15h30; Turno 2: 15h30 às 23h30 (hora local da unidade). É o turno de
-- quem trabalha, não o horário de abertura da loja. Só adiciona.
CREATE TABLE turno (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unidade_id integer NOT NULL REFERENCES unidade(id),
  nome       text NOT NULL,
  inicio     time NOT NULL,
  fim        time NOT NULL, -- '24:00' = meia-noite
  CHECK (fim > inicio)
);
CREATE UNIQUE INDEX turno_nome ON turno (unidade_id, lower(nome));

INSERT INTO turno (unidade_id, nome, inicio, fim)
  SELECT id, 'Turno 1', time '08:00', time '15:30' FROM unidade
  UNION ALL
  SELECT id, 'Turno 2', time '15:30', time '23:30' FROM unidade;

-- O turno em andamento no instante `agora` (hora local da unidade), ou nenhuma linha.
CREATE FUNCTION turno_em(p_unidade integer, agora timestamptz)
RETURNS TABLE (turno_id integer, nome text, inicio timestamptz, fim timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT t.id, t.nome, (d.dia + t.inicio) AT TIME ZONE u.fuso_horario, (d.dia + t.fim) AT TIME ZONE u.fuso_horario
  FROM unidade u
  CROSS JOIN LATERAL (SELECT date_trunc('day', agora AT TIME ZONE u.fuso_horario) AS dia) d
  JOIN turno t ON t.unidade_id = u.id
  WHERE u.id = p_unidade
    AND agora AT TIME ZONE u.fuso_horario >= d.dia + t.inicio
    AND agora AT TIME ZONE u.fuso_horario <  d.dia + t.fim
  ORDER BY t.inicio
  LIMIT 1
$$;

-- Até quando vale um aviso que nasce em `agora`: o fim do turno em andamento. Fora de
-- turno, 30 minutos (ninguém está no turno para receber; fica só registrado).
CREATE FUNCTION fim_do_aviso(p_unidade integer, agora timestamptz) RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT fim FROM turno_em(p_unidade, agora)), agora + interval '30 minutes')
$$;

-- A pessoa está no turno em `agora` se há turno em andamento e ela entrou no MESMO dia de
-- trabalho (até 1 h antes do primeiro turno do dia). Quem faz os dois turnos continua no
-- turno; uma sessão aberta ontem à noite não vale hoje de manhã.
CREATE FUNCTION pessoa_no_turno(p_unidade integer, entrou_em timestamptz, agora timestamptz) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM turno_em(p_unidade, agora))
     AND entrou_em >= (
       SELECT (date_trunc('day', agora AT TIME ZONE u.fuso_horario) + min(t.inicio)) AT TIME ZONE u.fuso_horario - interval '1 hour'
       FROM unidade u JOIN turno t ON t.unidade_id = u.id
       WHERE u.id = p_unidade
       GROUP BY u.fuso_horario)
$$;
