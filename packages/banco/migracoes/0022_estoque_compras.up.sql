-- 0022: compras no estoque (E09 parte 2; decisão 0027). Só adiciona.
-- Foto da nota de compra (uma entrada pode ter até 5 fotos) e o valor informado na correção de
-- custo de uma entrada. Nada muda nem some (RC-17).

CREATE TABLE estoque_nota_foto (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  movimento_id bigint NOT NULL REFERENCES estoque_movimento (id),
  tipo         text NOT NULL DEFAULT 'image/webp' CHECK (tipo = 'image/webp'),
  conteudo     bytea NOT NULL CHECK (octet_length(conteudo) BETWEEN 1 AND 2097152),
  largura      smallint NOT NULL CHECK (largura BETWEEN 1 AND 2000),
  altura       smallint NOT NULL CHECK (altura BETWEEN 1 AND 2000),
  sha256       text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  enviada_por  integer NOT NULL REFERENCES usuario (id),
  criado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX estoque_nota_foto_movimento ON estoque_nota_foto (movimento_id);
CREATE UNIQUE INDEX estoque_nota_foto_repetida ON estoque_nota_foto (movimento_id, sha256);

-- A foto é só de entrada de compra ou de saldo inicial.
CREATE FUNCTION estoque_nota_foto_da_entrada() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM estoque_movimento WHERE id = NEW.movimento_id AND tipo IN ('entrada', 'saldo_inicial')) THEN
    RAISE EXCEPTION 'Foto de nota só em entrada de compra.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER estoque_nota_foto_entrada BEFORE INSERT ON estoque_nota_foto
  FOR EACH ROW EXECUTE FUNCTION estoque_nota_foto_da_entrada();
CREATE TRIGGER estoque_nota_foto_imutavel BEFORE UPDATE OR DELETE ON estoque_nota_foto
  FOR EACH ROW EXECUTE FUNCTION estoque_historico_imutavel();

-- Correção de custo (movimento tipo 'custo'): o valor total certo daquela linha da entrada. O valor
-- que o movimento aplica (valor_centavos) é a parte que ainda está no estoque.
ALTER TABLE estoque_movimento_item ADD COLUMN valor_informado bigint CHECK (valor_informado >= 0);
