# 0017: tipos de produção

- Data: 17/11/2026
- Status: aceita
- Assunto da sessão: E07 parte 2, PR 2 (tipos de produção)

## Contexto
Fatos (RC-10 seção 1): as telas da cozinha são por tipo de pedido, não por lugar; cada
produto tem um tipo; criar tipo ou tela é configuração. A cozinha fica no andar de baixo e
entrega pelo elevador; a cafeteria fica no salão e entrega no balcão. A estimativa de espera
divide o tempo da fila pela capacidade de cada tipo (RC-10 seção 7), ajustável por turno.
Telas citadas no RC-10: Geral, Hambúrgueres, Pratos e grelhados, Elevador e Cafeteria.

## Decisão
1. Tabela `tipo_producao` (migração 0011): nome (2 a 40 letras, único entre os ativos, sem
   ligar para acento e maiúscula), área (`cozinha` ou `cafeteria`), capacidade (1 a 50 itens
   ao mesmo tempo), ordem e ativo. Cadastro único da empresa, como a categoria.
2. Começa com: Hambúrgueres (cozinha), Pratos e grelhados (cozinha) e Cafeteria (cafeteria).
3. Quem vê: `cadastros.ver`. Quem cria e altera: `cadastros.gerenciar`. Tudo auditado com
   antes e depois; nada se apaga (tipo fora de uso fica inativo).
4. A área diz de onde sai o pedido (cozinha: elevador; cafeteria: balcão).
5. Fica para depois: o produto aponta para o tipo (PR 3); telas como filtro de tipos, a
   capacidade por turno e o tempo de espera ajustável (E14). Produto sem tipo = não passa
   pela produção (ex.: bebida da geladeira, RC-10 seção 6).

## Respostas do responsável (19/11/2026)
- A capacidade de cada tipo pode ser mudada a qualquer hora pelos gerentes, na tela Tipos de
  produção (já funciona assim); começa em 1.
- **Porções, salgados e almoço são feitos na mesma cozinha, mas em locais diferentes:** cada um
  vira um **tipo de produção próprio** (área cozinha), com a sua tela. A casa cria ou ajusta pela tela;
  o próximo PR de código já deixa os três criados (migração, só se ainda não existirem).
- Feito na migração 0013 (19/11/2026): Porções, Salgados e Almoço, área cozinha, capacidade 1,
  depois dos que já existem. Tipo ativo com o mesmo nome (sem ligar para acento e maiúscula) não é
  criado de novo. A reversão só tira o tipo sem produto ligado e sem registro na auditoria.

## Hipóteses (a confirmar com o responsável)
- Capacidade inicial 1 em cada tipo (o responsável ajusta na tela).
- Os produtos fictícios da semente seguem nos tipos de antes (ex.: a porção de batata em "Pratos e
  grelhados"); a casa liga cada produto real ao tipo certo na tela Produtos.

## Alternativas descartadas
- Tipo por unidade: hoje há uma loja; a capacidade por turno (E14) já cobre a diferença.
- Área livre (texto): só existem duas áreas no RC-10; a sorveteria é franquia (RC-11).

## Consequências
Telas de produção (E14) e estimativa (E14) leem estes tipos. Mudar a área de um tipo muda
de onde o pedido sai, sem código.

## Critério de aceite e evidência
`packages/dominio/testes/tipos-producao.teste.ts` (PostgreSQL real): tipos iniciais (0011 e 0013), criar,
alterar mantendo o que não veio, auditoria, nome único, permissões, concorrência. Matriz da
API com as duas rotas novas.
