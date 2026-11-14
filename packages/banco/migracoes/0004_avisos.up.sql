-- 0004: central de avisos (E05, RC-18, decisão 0013).
-- Só adiciona: as colunas novas do aviso têm padrão, e nenhuma linha existente muda.

-- Prioridade e natureza. "operacional" só chega a quem está no turno e vale até o fim do
-- turno em que nasceu; "comunicado" é recado da gerência, com confirmação de leitura.
ALTER TABLE aviso
  ADD COLUMN prioridade     text NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('urgente', 'normal', 'informativo')),
  ADD COLUMN natureza       text NOT NULL DEFAULT 'operacional' CHECK (natureza IN ('operacional', 'comunicado')),
  ADD COLUMN autor_id       integer REFERENCES usuario(id),
  ADD COLUMN para_usuario_id integer REFERENCES usuario(id),
  ADD COLUMN expira_em      timestamptz;
-- Aviso operacional novo sempre tem validade. NOT VALID: os antigos (antes da E05, sem
-- validade) ficam como estão e simplesmente não são mais entregues.
ALTER TABLE aviso ADD CONSTRAINT aviso_operacional_tem_validade
  CHECK (natureza <> 'operacional' OR expira_em IS NOT NULL) NOT VALID;
ALTER TABLE aviso ADD CONSTRAINT aviso_comunicado_tem_autor
  CHECK (natureza <> 'comunicado' OR autor_id IS NOT NULL) NOT VALID;
CREATE INDEX aviso_entrega ON aviso (unidade_id, natureza, expira_em);

-- Quem recebeu cada aviso e o que fez com ele: novo (só entregue), visto, resolvido.
-- No comunicado, "resolvido" é a confirmação de leitura ("Li e entendi").
CREATE TABLE aviso_destino (
  aviso_id     bigint  NOT NULL REFERENCES aviso(id),
  usuario_id   integer NOT NULL REFERENCES usuario(id),
  cargo        text    NOT NULL REFERENCES perfil(codigo), -- cargo ativo em que recebeu
  entregue_em  timestamptz NOT NULL DEFAULT now(),
  visto_em     timestamptz,
  resolvido_em timestamptz,
  PRIMARY KEY (aviso_id, usuario_id),
  CHECK (resolvido_em IS NULL OR visto_em IS NOT NULL),
  CHECK (visto_em IS NULL OR visto_em >= entregue_em),
  CHECK (resolvido_em IS NULL OR resolvido_em >= visto_em)
);
CREATE INDEX aviso_destino_pessoa ON aviso_destino (usuario_id, aviso_id DESC);

-- Nada é apagado (RC-17). A situação só anda para a frente: cada data é gravada uma vez.
CREATE FUNCTION aviso_destino_so_avanca() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.aviso_id <> OLD.aviso_id OR NEW.usuario_id <> OLD.usuario_id OR NEW.cargo <> OLD.cargo
     OR NEW.entregue_em <> OLD.entregue_em
     OR (OLD.visto_em IS NOT NULL AND NEW.visto_em IS DISTINCT FROM OLD.visto_em)
     OR (OLD.resolvido_em IS NOT NULL AND NEW.resolvido_em IS DISTINCT FROM OLD.resolvido_em) THEN
    RAISE EXCEPTION 'A situação do aviso só anda para a frente (RC-17).' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aviso_destino_avanca
  BEFORE UPDATE ON aviso_destino
  FOR EACH ROW EXECUTE FUNCTION aviso_destino_so_avanca();
CREATE TRIGGER aviso_destino_sem_apagar
  BEFORE DELETE ON aviso_destino
  FOR EACH ROW EXECUTE FUNCTION recusar_alteracao();
CREATE TRIGGER aviso_destino_sem_truncate
  BEFORE TRUNCATE ON aviso_destino
  FOR EACH STATEMENT EXECUTE FUNCTION recusar_alteracao();
