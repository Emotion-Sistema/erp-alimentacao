-- 0028: o aviso urgente do estoque que ninguém viu sobe para o superior (E10 parte 2; RC-18 "urgente
-- não visto ... sobe para o superior depois do tempo configurado"; decisão 0029). Só adiciona.
-- Uma linha por aviso que subiu: liga o aviso de origem ao aviso novo, mandado ao superior. A chave
-- primária garante que cada aviso sobe uma vez só, mesmo com duas execuções do worker ao mesmo tempo.
CREATE TABLE aviso_subida (
  aviso_id      bigint PRIMARY KEY REFERENCES aviso(id),
  novo_aviso_id bigint NOT NULL UNIQUE REFERENCES aviso(id),
  em            timestamptz NOT NULL DEFAULT now()
);
-- Nada é apagado nem muda (RC-17).
CREATE TRIGGER aviso_subida_so_insercao
  BEFORE UPDATE OR DELETE ON aviso_subida
  FOR EACH ROW EXECUTE FUNCTION recusar_alteracao();
CREATE TRIGGER aviso_subida_sem_truncate
  BEFORE TRUNCATE ON aviso_subida
  FOR EACH STATEMENT EXECUTE FUNCTION recusar_alteracao();
-- Procura dos urgentes ainda valendo (o worker olha a cada poucos minutos).
CREATE INDEX aviso_urgente_valendo ON aviso (expira_em) WHERE prioridade = 'urgente' AND natureza = 'operacional';
