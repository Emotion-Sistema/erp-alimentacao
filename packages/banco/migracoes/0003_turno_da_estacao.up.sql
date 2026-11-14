-- 0003: o tablet da cozinha sai sozinho às 00h30 (definido em 14/11/2026), e a própria cozinha
-- pode estender o turno algumas vezes (cada vez fica registrada).
ALTER TABLE unidade ALTER COLUMN fim_turno SET DEFAULT '00:30';
-- Só troca quem ainda está no padrão antigo; horário já ajustado à mão fica como está.
UPDATE unidade SET fim_turno = '00:30' WHERE fim_turno = '23:30';

ALTER TABLE estacao_presenca
  ADD COLUMN prorrogacoes integer NOT NULL DEFAULT 0 CHECK (prorrogacoes >= 0);

-- Quando a presença na estação vence, para quem entra no instante `agora`. É o próximo fim do
-- turno no horário local da unidade (00h30). Quem entra de madrugada, depois do fim do turno
-- (o próximo fim estaria a mais de 20 h), ganha só 30 min, para ninguém ficar logado de um dia
-- para o outro. Função separada para poder ser testada com horários fixos.
CREATE FUNCTION fim_do_turno(p_unidade integer, agora timestamptz) RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN proximo - agora > interval '20 hours' THEN agora + interval '30 minutes' ELSE proximo END
  FROM (
    SELECT (CASE WHEN fim_local > agora_local THEN fim_local ELSE fim_local + interval '1 day' END) AT TIME ZONE fuso AS proximo
    FROM (SELECT date_trunc('day', agora AT TIME ZONE fuso_horario) + fim_turno AS fim_local,
                 agora AT TIME ZONE fuso_horario AS agora_local, fuso_horario AS fuso
          FROM unidade WHERE id = p_unidade) t
  ) u
$$;
