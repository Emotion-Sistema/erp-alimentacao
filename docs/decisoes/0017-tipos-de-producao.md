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

## Hipóteses (a confirmar com o responsável)
- Capacidade inicial 1 em cada tipo (o responsável ajusta na tela).
- Porções, salgados e almoço entram em "Pratos e grelhados" até o responsável criar tipos
  próprios.

## Alternativas descartadas
- Tipo por unidade: hoje há uma loja; a capacidade por turno (E14) já cobre a diferença.
- Área livre (texto): só existem duas áreas no RC-10; a sorveteria é franquia (RC-11).

## Consequências
Telas de produção (E14) e estimativa (E14) leem estes tipos. Mudar a área de um tipo muda
de onde o pedido sai, sem código.

## Critério de aceite e evidência
`packages/dominio/testes/tipos-producao.teste.ts` (PostgreSQL real): tipos iniciais, criar,
alterar mantendo o que não veio, auditoria, nome único, permissões, concorrência. Matriz da
API com as duas rotas novas.
