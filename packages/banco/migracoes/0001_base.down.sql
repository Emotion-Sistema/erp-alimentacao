-- Reversão da 0001. Só para desenvolvimento: apaga tudo, inclusive a auditoria.
DROP TABLE IF EXISTS auditoria, sessao, usuario_perfil, usuario, perfil, setor, unidade, empresa;
DROP FUNCTION IF EXISTS recusar_alteracao();
