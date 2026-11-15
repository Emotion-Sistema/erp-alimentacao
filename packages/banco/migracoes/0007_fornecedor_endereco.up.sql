-- 0007: endereço do fornecedor (preenchido à mão ou pela consulta pública do CNPJ; ideia nº 4).
-- Só adiciona.
ALTER TABLE fornecedor ADD COLUMN endereco text CHECK (length(endereco) <= 300);
