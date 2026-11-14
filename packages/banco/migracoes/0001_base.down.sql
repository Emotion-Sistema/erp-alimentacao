-- Reversão da 0001. Apaga tudo, inclusive a auditoria. Por isso, se a auditoria tiver
-- qualquer registro, só roda com confirmação explícita (ERP_CONFIRMO_APAGAR_AUDITORIA=sim),
-- que vale apenas para bancos de desenvolvimento.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auditoria)
     AND coalesce(current_setting('erp.confirmo_apagar_auditoria', true), '') <> 'sim' THEN
    RAISE EXCEPTION 'A auditoria tem registros e seria apagada (RC-17). Reversão recusada.';
  END IF;
END $$;

DROP TABLE IF EXISTS auditoria, sessao, usuario_perfil, usuario, perfil, setor, unidade, empresa;
DROP FUNCTION IF EXISTS recusar_alteracao();
