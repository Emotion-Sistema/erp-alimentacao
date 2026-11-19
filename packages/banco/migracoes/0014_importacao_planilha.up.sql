-- Importação de planilha (E07 parte 3; decisão 0020). Uma linha por importação GRAVADA (a
-- conferência não grava nada). Serve para duas coisas:
--  1. Idempotência: a chave vem da conferência; clique duplo ou reenvio com a mesma chave não
--     importa de novo (UNIQUE). A assinatura (sha-256 do arquivo, do tipo, do mapa de colunas e
--     das linhas puladas) impede usar a mesma chave para outra coisa.
--  2. Registro: quem importou, que arquivo, quantas linhas e o que foi criado (ids). Cada item
--     criado também fica na auditoria, com o id desta importação.
-- Só inserção: nada aqui é alterado nem apagado (RC-17).

CREATE TABLE importacao_planilha (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave        uuid NOT NULL,
  assinatura   text NOT NULL CHECK (assinatura ~ '^[0-9a-f]{64}$'),
  tipo         text NOT NULL CHECK (tipo IN ('ingredientes', 'produtos')),
  arquivo      text NOT NULL CHECK (length(arquivo) BETWEEN 1 AND 200 AND arquivo !~ '[[:cntrl:]]'),
  formato      text NOT NULL CHECK (formato IN ('xlsx', 'csv', 'html')),
  linhas_lidas integer NOT NULL CHECK (linhas_lidas BETWEEN 0 AND 2000),
  criados      integer NOT NULL CHECK (criados >= 0),
  ja_existiam  integer NOT NULL CHECK (ja_existiam >= 0),
  puladas      integer NOT NULL CHECK (puladas >= 0),
  ids          integer[] NOT NULL DEFAULT '{}',
  usuario_id   integer NOT NULL REFERENCES usuario (id),
  criado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT importacao_planilha_contas CHECK (criados + ja_existiam + puladas <= linhas_lidas AND cardinality(ids) = criados)
);
CREATE UNIQUE INDEX importacao_planilha_chave ON importacao_planilha (chave);
CREATE INDEX importacao_planilha_quando ON importacao_planilha (criado_em);

CREATE TRIGGER importacao_planilha_so_insercao
  BEFORE UPDATE OR DELETE ON importacao_planilha
  FOR EACH ROW EXECUTE FUNCTION recusar_alteracao();
CREATE TRIGGER importacao_planilha_sem_truncate
  BEFORE TRUNCATE ON importacao_planilha
  FOR EACH STATEMENT EXECUTE FUNCTION recusar_alteracao();
