-- 0001: empresa, unidade, setor, perfil (cargo), usuário, sessão e auditoria.

CREATE TABLE empresa (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  razao_social  text NOT NULL,
  nome_fantasia text NOT NULL,
  cnpj          text UNIQUE CHECK (cnpj ~ '^[0-9]{14}$'), -- texto, só dígitos
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE unidade (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id   integer NOT NULL REFERENCES empresa(id),
  nome         text NOT NULL,
  fuso_horario text NOT NULL DEFAULT 'America/Sao_Paulo',
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, nome)
);

CREATE TABLE setor (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unidade_id integer NOT NULL REFERENCES unidade(id),
  nome       text NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade_id, nome)
);

-- Cargos (RC-12). As ações de cada cargo ficam no código (pacote de domínio),
-- versionadas e testadas; aqui só o catálogo, para chave estrangeira.
CREATE TABLE perfil (
  codigo text PRIMARY KEY CHECK (codigo ~ '^[a-z_]+$'),
  nome   text NOT NULL
);

INSERT INTO perfil (codigo, nome) VALUES
  ('dono', 'Dono'),
  ('administrador', 'Administrador'),
  ('gerente_geral', 'Gerente geral'),
  ('financeiro', 'Financeiro'),
  ('supervisor', 'Supervisor'),
  ('atendente', 'Atendente'),
  ('caixa', 'Caixa'),
  ('cozinheira', 'Cozinheira'),
  ('auxiliar_cozinha', 'Auxiliar de cozinha'),
  ('motoboy', 'Motoboy próprio'),
  ('contador', 'Contador externo');

CREATE TABLE usuario (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome         text NOT NULL,
  login        text NOT NULL,
  senha_hash   text,
  ativo        boolean NOT NULL DEFAULT true,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  desligado_em timestamptz,
  CHECK (ativo OR desligado_em IS NOT NULL)
);
CREATE UNIQUE INDEX usuario_login_unico ON usuario (lower(login));

CREATE TABLE usuario_perfil (
  usuario_id    integer NOT NULL REFERENCES usuario(id),
  perfil_codigo text NOT NULL REFERENCES perfil(codigo),
  unidade_id    integer NOT NULL REFERENCES unidade(id),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, perfil_codigo, unidade_id)
);

-- O token da sessão nunca é gravado: só o hash SHA-256 dele.
CREATE TABLE sessao (
  id          text PRIMARY KEY,
  usuario_id  integer NOT NULL REFERENCES usuario(id),
  criada_em   timestamptz NOT NULL DEFAULT now(),
  expira_em   timestamptz NOT NULL,
  revogada_em timestamptz,
  ip          text,
  agente      text
);
CREATE INDEX sessao_usuario ON sessao (usuario_id);

-- Auditoria (RC-17): só inserção. Alterar ou apagar é recusado pelo banco.
CREATE TABLE auditoria (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  usuario_id  integer REFERENCES usuario(id),
  acao        text NOT NULL,
  resultado   text NOT NULL CHECK (resultado IN ('permitido', 'recusado', 'falhou')),
  alvo_tipo   text,
  alvo_id     text,
  detalhes    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip          text
);
CREATE INDEX auditoria_usuario_quando ON auditoria (usuario_id, ocorrido_em);
CREATE INDEX auditoria_acao_quando ON auditoria (acao, ocorrido_em);

CREATE FUNCTION recusar_alteracao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registro de % não pode ser alterado nem apagado (RC-17).', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER auditoria_so_insercao
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION recusar_alteracao();
CREATE TRIGGER auditoria_sem_truncate
  BEFORE TRUNCATE ON auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION recusar_alteracao();
