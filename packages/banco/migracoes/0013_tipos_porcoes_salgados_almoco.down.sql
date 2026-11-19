-- Reversão da 0013 (só desenvolvimento): tira os tipos Porções, Salgados e Almoço.
-- Só apaga o tipo que ninguém usou nem mexeu: sem produto ligado (nem inativo) e sem registro
-- na auditoria (criado ou alterado pela tela). Assim um tipo com o mesmo nome criado pela casa,
-- ou um destes já em uso, fica onde está. Nada mais muda.
DELETE FROM tipo_producao t
WHERE nome_de_unidade(t.nome) IN (nome_de_unidade('Porções'), nome_de_unidade('Salgados'), nome_de_unidade('Almoço'))
  AND NOT EXISTS (SELECT 1 FROM produto p WHERE p.tipo_producao_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM auditoria a WHERE a.alvo_tipo = 'tipo_producao' AND a.alvo_id = t.id::text);
