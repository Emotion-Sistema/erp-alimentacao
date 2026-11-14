-- 0002: acessos completos (E03, RC-12).
-- Cargo ativo e segundo fator na sessão; bloqueio por tentativas; código pessoal de
-- 4 dígitos; estações (tablets da cozinha) e quem está em cada uma; avisos.
-- Só adiciona: nenhuma coluna existente perde dado.

-- Fim do turno: quem entrou na estação sai sozinho neste horário (hora local da unidade).
ALTER TABLE unidade ADD COLUMN fim_turno time NOT NULL DEFAULT '23:30';

ALTER TABLE usuario
  ADD COLUMN senha_erros         integer NOT NULL DEFAULT 0 CHECK (senha_erros >= 0),
  ADD COLUMN senha_bloqueada_ate timestamptz,
  -- Código pessoal: só o hash (Argon2id). Bloqueado após 3 erros, até alguém desbloquear.
  ADD COLUMN codigo_hash         text,
  ADD COLUMN codigo_erros        integer NOT NULL DEFAULT 0 CHECK (codigo_erros >= 0),
  ADD COLUMN codigo_bloqueado_em timestamptz,
  -- Segundo fator (TOTP): o segredo fica cifrado com a chave do cofre (ERP_CHAVE_SEGREDOS).
  ADD COLUMN totp_segredo        text,
  ADD COLUMN totp_pendente       text,
  ADD COLUMN totp_ultimo_passo   bigint,
  -- Erros do segundo fator contam por pessoa (todas as sessões); 5 bloqueiam por 15 min.
  ADD COLUMN totp_erros          integer NOT NULL DEFAULT 0 CHECK (totp_erros >= 0),
  ADD COLUMN totp_bloqueado_ate  timestamptz;

-- Cargo removido não some: ganha data e autor (RC-17, nada é apagado).
ALTER TABLE usuario_perfil DROP CONSTRAINT usuario_perfil_pkey;
ALTER TABLE usuario_perfil
  ADD COLUMN id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ADD COLUMN criado_por   integer REFERENCES usuario(id),
  ADD COLUMN removido_em  timestamptz,
  ADD COLUMN removido_por integer REFERENCES usuario(id),
  ADD CHECK ((removido_em IS NULL) = (removido_por IS NULL));
CREATE UNIQUE INDEX usuario_perfil_vigente ON usuario_perfil (usuario_id, perfil_codigo, unidade_id)
  WHERE removido_em IS NULL;

ALTER TABLE sessao
  ADD COLUMN cargo_ativo         text REFERENCES perfil(codigo),
  ADD COLUMN segundo_fator_ok    boolean NOT NULL DEFAULT false;

-- Estação = aparelho cadastrado (tablet da cozinha). O aparelho guarda um token;
-- aqui fica só o hash dele.
CREATE TABLE estacao (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unidade_id   integer NOT NULL REFERENCES unidade(id),
  nome         text NOT NULL,
  tipo         text NOT NULL DEFAULT 'cozinha' CHECK (tipo IN ('cozinha')),
  token_hash   text NOT NULL UNIQUE,
  criada_em    timestamptz NOT NULL DEFAULT now(),
  criada_por   integer NOT NULL REFERENCES usuario(id),
  revogada_em  timestamptz,
  revogada_por integer REFERENCES usuario(id),
  CHECK ((revogada_em IS NULL) = (revogada_por IS NULL))
);
CREATE UNIQUE INDEX estacao_nome_vigente ON estacao (unidade_id, lower(nome)) WHERE revogada_em IS NULL;

-- Quem está em cada estação. Uma pessoa fica em uma estação por vez; "ativa" é quem
-- responde pelos próximos toques.
CREATE TABLE estacao_presenca (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  estacao_id  integer NOT NULL REFERENCES estacao(id),
  usuario_id  integer NOT NULL REFERENCES usuario(id),
  cargo       text NOT NULL REFERENCES perfil(codigo),
  entrou_em   timestamptz NOT NULL DEFAULT now(),
  expira_em   timestamptz NOT NULL,
  ativa_desde timestamptz,
  saiu_em     timestamptz,
  motivo_saida text CHECK (motivo_saida IN ('saiu', 'outra_estacao', 'desligado', 'estacao_revogada', 'expirou')),
  CHECK ((saiu_em IS NULL) = (motivo_saida IS NULL)),
  CHECK (expira_em > entrou_em)
);
CREATE UNIQUE INDEX presenca_uma_por_pessoa ON estacao_presenca (usuario_id) WHERE saiu_em IS NULL;
CREATE INDEX presenca_estacao_aberta ON estacao_presenca (estacao_id) WHERE saiu_em IS NULL;
-- No máximo uma pessoa ativa por estação.
CREATE UNIQUE INDEX presenca_uma_ativa ON estacao_presenca (estacao_id) WHERE saiu_em IS NULL AND ativa_desde IS NOT NULL;

-- Avisos para cargos de uma unidade (ex.: código bloqueado avisa o supervisor).
-- A central de avisos e o aviso no aparelho são a E05; aqui só o registro.
CREATE TABLE aviso (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  unidade_id  integer NOT NULL REFERENCES unidade(id),
  para_cargos text[] NOT NULL CHECK (cardinality(para_cargos) > 0),
  tipo        text NOT NULL,
  texto       text NOT NULL,
  dados       jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX aviso_unidade_quando ON aviso (unidade_id, criado_em);
CREATE TRIGGER aviso_so_insercao
  BEFORE UPDATE OR DELETE ON aviso
  FOR EACH ROW EXECUTE FUNCTION recusar_alteracao();
CREATE TRIGGER aviso_sem_truncate
  BEFORE TRUNCATE ON aviso
  FOR EACH STATEMENT EXECUTE FUNCTION recusar_alteracao();
