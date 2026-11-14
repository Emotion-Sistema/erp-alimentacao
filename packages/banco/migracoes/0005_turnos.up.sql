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

-- Margem de troca de turno: depois do fim de cada turno, quem sai ainda recebe avisos por
-- este tempo (passa o serviço) e os avisos do turno ainda valem para quem chega. Nenhum
-- aviso cai no vão da troca. Padrão 30 min (sugestão aceita a confirmar, 14/11/2026).
ALTER TABLE unidade ADD COLUMN margem_troca_turno interval NOT NULL DEFAULT '30 minutes'
  CHECK (margem_troca_turno >= interval '0' AND margem_troca_turno <= interval '2 hours');

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

-- Até quando vale um aviso que nasce em `agora`: o fim do turno em andamento mais a margem
-- de troca (o próximo turno também recebe). Fora de turno, só a margem.
CREATE FUNCTION fim_do_aviso(p_unidade integer, agora timestamptz) RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT fim FROM turno_em(p_unidade, agora)), agora) + u.margem_troca_turno
  FROM unidade u WHERE u.id = p_unidade
$$;

-- Turnos não podem se sobrepor na mesma unidade.
CREATE FUNCTION turno_sem_sobrepor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM turno t WHERE t.unidade_id = NEW.unidade_id AND t.id <> NEW.id
             AND NEW.inicio < t.fim AND t.inicio < NEW.fim) THEN
    RAISE EXCEPTION 'Turno % se sobrepõe a outro turno da unidade.', NEW.nome USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER turno_nao_sobrepoe
  BEFORE INSERT OR UPDATE ON turno
  FOR EACH ROW EXECUTE FUNCTION turno_sem_sobrepor();

-- Até quando vai o turno de quem entrou em `entrou_em`: o turno em andamento na entrada
-- (quem entra às 15h10 é do Turno 1; ninguém é contado como "chegou mais cedo"). Quem entra
-- fora de turno, até 1 h antes de um turno começar (ex.: 07h40), é desse turno. Senão, nulo
-- (não está em turno nenhum).
CREATE FUNCTION fim_do_turno_da_entrada(p_unidade integer, entrou_em timestamptz) RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    (SELECT fim FROM turno_em(p_unidade, entrou_em)),
    (SELECT fim FROM turno_em(p_unidade, entrou_em + interval '1 hour')))
$$;

-- Imprevisto: quem precisa ficar toca em "Continuo no turno"; a sessão passa a valer até o
-- fim do turno em andamento. Cada toque fica na auditoria.
ALTER TABLE sessao ADD COLUMN turno_ate timestamptz;

-- A pessoa está no turno em `agora` até o fim do turno em que entrou (ou do turno em que
-- tocou "Continuo") mais a margem de troca. Cada um tem o próprio login, mesmo no celular
-- dividido: no fim do turno a pessoa sai e a próxima entra (responsável, 14/11/2026).
-- Quem esquece de sair para de receber ao fim da margem.
CREATE FUNCTION pessoa_no_turno(p_unidade integer, entrou_em timestamptz, turno_ate timestamptz, agora timestamptz) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(agora < greatest(fim_do_turno_da_entrada(p_unidade, entrou_em), turno_ate) + u.margem_troca_turno, false)
  FROM unidade u WHERE u.id = p_unidade
$$;
