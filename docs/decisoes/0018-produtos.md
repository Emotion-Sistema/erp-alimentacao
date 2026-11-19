# 0018: produtos (E07, parte 2, PR 3)

- Data: 18/11/2026
- Status: aceita; hipóteses abaixo
- Assunto da sessão: E07 parte 2, cadastro de produtos
- Complementa: decisões 0016 (categorias), 0017 (tipos de produção) e o adendo de 18/11 da 0012
  (campo que depende do que já existe mostra a lista)

## Contexto
O cardápio precisa de produtos para que o pedido (E11), a disponibilidade (E12) e as telas da
cozinha (E14) tenham o que mostrar. RC-10: cada produto tem um tipo e um tempo de preparo padrão.
RC-07: o site lê o mesmo cadastro (descrição para a vitrine). Dinheiro sempre em centavos.

## Decisão
1. Tabela `produto` (migração 0012): nome (2 a 60 letras, único entre os ativos, sem ligar para
   acento e maiúscula), descrição (até 300, para o site), categoria (obrigatória), tipo de
   produção (opcional), preço em centavos (R$ 0,01 a R$ 9.999,99), tempo de preparo em minutos
   (1 a 180), ordem e ativo.
2. **Tipo e tempo andam juntos.** Com tipo, o produto passa pela produção e o tempo é obrigatório.
   Sem tipo (bebida da geladeira, RC-10 seção 6), não há tempo. O banco segura a regra
   (`produto_tempo_com_tipo`); tirar o tipo tira o tempo.
3. **Lugar no cardápio:** cada categoria tem a sua lista. A pessoa escolhe a posição vendo os
   produtos daquela categoria (componente `PosicaoNaLista`); o sistema renumera de 10 em 10.
   Mudar de categoria sem escolher lugar põe o produto no fim da nova. Uma trava única por tabela
   (`travarLista`) faz duas gravações esperarem uma pela outra.
4. Categoria e tipo escolhidos agora (ou ao reativar o produto) precisam estar ativos. Produto que
   já estava numa categoria depois desativada continua lá (a E12 decide o que se vende).
5. Quem vê: `cadastros.ver`. Quem cria e altera: `cadastros.gerenciar`. Tudo auditado com antes e
   depois: o histórico de preço é a auditoria. Nada se apaga (produto fora de venda fica inativo).
6. A tela digita o preço em reais ("12,50"); a conversão para centavos é feita pelos dígitos
   (`centavosDoTexto`, `@erp/dominio/produtos`), nunca com número de vírgula (float).

## Respostas do responsável (19/11/2026)
- **Preço por canal: SIM, preços diferentes** na loja e no delivery (a ideia é juntar no futuro).
  Substitui a hipótese "um preço só".
- **Cortesia = desconto no pedido** (nada de produto a R$ 0,00): confirmado.
- **Foto, tamanhos, adicionais e combos:** criar já toda a base e as telas, para a equipe só
  cadastrar depois.

## Hipóteses (a confirmar com o responsável)
- ~~Um preço só para todos os canais por enquanto~~ Substituída: preço do delivery próprio na
  decisão 0021.
- Foto, alergênicos e combos ficam para PRs próprios; tamanhos e adicionais na decisão 0021.
- Preço mínimo R$ 0,01 (nada de produto a R$ 0,00; cortesia será um desconto no pedido).
- Cardápio inventado só nos dados fictícios de desenvolvimento, até chegar o real.

## Alternativas descartadas
- Preço em número com vírgula (float): proibido pelas regras do sistema.
- Ordem única para todos os produtos: o cardápio é lido por categoria.
- Tabela de histórico de preço separada: a auditoria já guarda antes e depois; o pedido guardará
  o preço aplicado (E11).

## Consequências
O pedido (E11) copia nome e preço do produto para o item. A E12 cruza produto, ficha técnica e
estoque. As telas da cozinha (E14) filtram pelo tipo e usam o tempo de preparo.

## Critério de aceite e evidência
`packages/dominio/testes/produtos.teste.ts` (PostgreSQL real): preço em centavos a partir do
texto, criar, alterar mantendo o que não veio, auditoria, tipo e tempo juntos (também no banco),
categoria e tipo desativados, nome único, permissões, posição por categoria e concorrência
(junto com a ordem das categorias). Matriz da API com as duas rotas novas.
