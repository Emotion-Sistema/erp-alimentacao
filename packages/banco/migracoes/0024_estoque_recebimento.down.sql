-- Reversão da 0024 (só desenvolvimento). O histórico não se apaga: se algum saldo ou linha já usou o
-- local "a receber", a reversão é recusada (o código da 0023 contaria esse saldo como guardado).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM estoque_saldo WHERE local = 'a_receber')
     OR EXISTS (SELECT 1 FROM estoque_movimento_linha WHERE local = 'a_receber') THEN
    RAISE EXCEPTION 'Há estoque que já passou por "a receber": a 0024 não se reverte neste banco.';
  END IF;
END $$;
DROP TABLE IF EXISTS estoque_recebimento_fim;
DROP TABLE IF EXISTS estoque_recebimento;
DROP FUNCTION IF EXISTS estoque_recebimento_de_transferencia();
ALTER TABLE estoque_movimento_linha DROP CONSTRAINT IF EXISTS estoque_movimento_linha_a_receber_livre;
ALTER TABLE estoque_saldo DROP CONSTRAINT IF EXISTS estoque_saldo_a_receber_livre;
ALTER TABLE estoque_movimento_linha DROP CONSTRAINT estoque_movimento_linha_local_check;
ALTER TABLE estoque_movimento_linha ADD CONSTRAINT estoque_movimento_linha_local_check CHECK (local IN ('em_uso', 'guardado'));
ALTER TABLE estoque_saldo DROP CONSTRAINT estoque_saldo_local_check;
ALTER TABLE estoque_saldo ADD CONSTRAINT estoque_saldo_local_check CHECK (local IN ('em_uso', 'guardado'));
-- Reverta junto o código que usa estas tabelas (packages/dominio/src/estoque-recebimento.ts).
