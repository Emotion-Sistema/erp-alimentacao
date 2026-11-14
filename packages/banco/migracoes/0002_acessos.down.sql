-- Reversão da 0002 (só desenvolvimento: reverter é recusado em produção pelo executor).
-- Perde: estações, presenças, avisos, códigos, segundo fator e o histórico de cargos
-- removidos (as linhas removidas de usuario_perfil são apagadas para voltar à chave antiga).
DROP TABLE IF EXISTS aviso, estacao_presenca, estacao;

ALTER TABLE sessao
  DROP COLUMN IF EXISTS segundo_fator_erros,
  DROP COLUMN IF EXISTS segundo_fator_ok,
  DROP COLUMN IF EXISTS cargo_ativo;

DROP INDEX IF EXISTS usuario_perfil_vigente;
DELETE FROM usuario_perfil WHERE removido_em IS NOT NULL;
ALTER TABLE usuario_perfil
  DROP COLUMN IF EXISTS id,
  DROP COLUMN IF EXISTS criado_por,
  DROP COLUMN IF EXISTS removido_em,
  DROP COLUMN IF EXISTS removido_por;
ALTER TABLE usuario_perfil ADD PRIMARY KEY (usuario_id, perfil_codigo, unidade_id);

ALTER TABLE usuario
  DROP COLUMN IF EXISTS totp_ultimo_passo,
  DROP COLUMN IF EXISTS totp_pendente,
  DROP COLUMN IF EXISTS totp_segredo,
  DROP COLUMN IF EXISTS codigo_bloqueado_em,
  DROP COLUMN IF EXISTS codigo_erros,
  DROP COLUMN IF EXISTS codigo_hash,
  DROP COLUMN IF EXISTS senha_bloqueada_ate,
  DROP COLUMN IF EXISTS senha_erros;

ALTER TABLE unidade DROP COLUMN IF EXISTS fim_turno;
