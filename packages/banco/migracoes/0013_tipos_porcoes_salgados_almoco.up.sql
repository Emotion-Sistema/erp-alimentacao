-- Tipos de produção Porções, Salgados e Almoço (resposta do responsável em 19/11/2026;
-- decisão 0017): são feitos na mesma cozinha, mas em locais diferentes, e cada um tem a sua tela.
-- Área cozinha, capacidade 1 (o gerente ajusta na tela Tipos de produção).
-- Só entra o tipo que ainda não existe ativo com o mesmo nome (sem ligar para acento e
-- maiúscula, como o índice único da 0011): se a casa já criou "Porções" pela tela, fica o dela.
-- Ordem: depois dos que já existem (maior ordem + 10, + 20 e + 30; nunca passa de 9999).

INSERT INTO tipo_producao (nome, area, capacidade, ordem)
SELECT n.nome, 'cozinha', 1, LEAST(9999, (SELECT coalesce(max(ordem), 0) FROM tipo_producao) + n.passo)
FROM (VALUES ('Porções', 10), ('Salgados', 20), ('Almoço', 30)) AS n (nome, passo)
WHERE NOT EXISTS (
  SELECT 1 FROM tipo_producao t WHERE t.ativo AND nome_de_unidade(t.nome) = nome_de_unidade(n.nome)
)
ORDER BY n.passo;
