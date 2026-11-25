-- Reversão da 0027 (só desenvolvimento). Tira os números escolhidos; as mesas voltam ao número padrão.
-- Reverta junto o código que usa a tabela (packages/dominio/src/mesas-numeros.ts).
DROP TABLE IF EXISTS mesa_numero;
