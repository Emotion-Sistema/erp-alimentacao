-- 0008: unidade para mostrar de cada ingrediente (ideia nº 5, 15/11/2026; decisão 0015, item 9).
-- O estoque continua contando em g, ml ou un (unidade_base, fixa, conta exata). A pessoa escolhe
-- numa lista pronta como quer VER e informar as quantidades: kg ou g, L ou ml, un ou dz.
-- Só muda a exibição: nenhum saldo, conversão ou ficha técnica muda de valor. Só adiciona.
ALTER TABLE ingrediente ADD COLUMN unidade_exibicao text REFERENCES unidade_medida (codigo);
UPDATE ingrediente SET unidade_exibicao = unidade_base;

-- Sem unidade para mostrar, vale a do estoque (quem grava sem ela continua funcionando).
CREATE FUNCTION ingrediente_exibicao_padrao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.unidade_exibicao IS NULL THEN
    NEW.unidade_exibicao := NEW.unidade_base;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ingrediente_exibicao_padrao
  BEFORE INSERT OR UPDATE ON ingrediente
  FOR EACH ROW EXECUTE FUNCTION ingrediente_exibicao_padrao();

ALTER TABLE ingrediente ALTER COLUMN unidade_exibicao SET NOT NULL;
-- Só da mesma família da unidade do estoque: g -> g ou kg; ml -> ml ou L; un -> un ou dz.
ALTER TABLE ingrediente ADD CONSTRAINT ingrediente_exibicao_da_familia CHECK (
  (unidade_base = 'g' AND unidade_exibicao IN ('g', 'kg')) OR
  (unidade_base = 'ml' AND unidade_exibicao IN ('ml', 'l')) OR
  (unidade_base = 'un' AND unidade_exibicao IN ('un', 'dz'))
);
