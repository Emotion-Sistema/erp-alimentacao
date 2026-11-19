# 0021: preço do delivery, tamanhos e adicionais (produtos completos, parte 1)

- Data: 19/11/2026
- Status: aceita
- Assunto da sessão: passo 3 do plano de 19/11/2026 (produtos completos)

## Contexto
Respostas do responsável (19/11/2026, decisão 0018): os preços são **diferentes na loja e no
delivery** ("a ideia é juntar tudo no futuro"), e foto, tamanhos, adicionais e combos devem ter
**toda a base e as telas prontas**, para a equipe só cadastrar depois. Ainda não há cardápio real.
O pedido (E11) vai precisar de uma regra única e testada para o preço de cada item.

## Decisão
1. **Preço do delivery** (migração 0015): o produto tem o preço da loja e, se for diferente, o do
   delivery (`preco_delivery_centavos`). **Vazio = igual ao da loja.** "Juntar no futuro" é só
   limpar o campo (ou a coluna), sem migrar dados.
2. **Tamanhos** (`produto_tamanho`): cada tamanho soma um **acréscimo** ao preço do produto (0 no
   menor), com acréscimo próprio no delivery opcional (vazio = igual ao da loja). Produto com
   tamanho ativo só se vende com um tamanho escolhido. Até 10 por produto. A tela manda a lista
   completa, na ordem: o que sai fica inativo (nada se apaga) e pode voltar com o mesmo id.
3. **Adicionais em grupos reutilizáveis** (`grupo_adicional`, `adicional`,
   `produto_grupo_adicional`): um grupo ("Ponto da carne", "Turbine seu lanche") serve para vários
   produtos. Cada grupo tem **mínimo e máximo de escolhas** (mínimo 0 = opcional; 1 ou mais =
   obrigatório). Cada item tem preço (pode ser 0), preço no delivery opcional e **quantas vezes
   entra no mesmo item** (1 a 10, ex.: bacon extra até 3x). Grupo obrigatório ativo precisa ter
   itens ativos que bastem para o mínimo. Tela própria: Cadastros → Adicionais.
4. **Regra única do preço do item** (`precoDoItem`, em `produtos-comum`): preço do produto no canal
   + acréscimo do tamanho no canal + soma de (preço do adicional no canal × quantidade). Confere:
   produto ativo, tamanho do próprio produto, adicional de um grupo ativo ligado ao produto, item
   ativo, mínimo e máximo de cada grupo, vezes por item, nada repetido. A tela usa a mesma função
   para mostrar a prévia; o servidor (`calcularPrecoDoItem`) relê tudo do banco e **nunca usa preço
   vindo da tela**. Tudo em centavos inteiros.
5. Concorrência: gravar produto continua na trava da lista de produtos; ligar um grupo novo ao
   produto lê o grupo com `FOR SHARE`, e alterar o grupo o lê com `FOR UPDATE`, então desativar um
   grupo enquanto outro o liga termina sempre consistente (teste determinístico com duas conexões:
   a ligação espera a trava do grupo e, se ele foi desativado, é recusada).
   Num item ou tamanho que já existe, campo ausente fica como está; só `null` limpa o preço do
   delivery (volta a ser igual ao da loja).
6. Auditoria com antes e depois do produto (com tamanhos e grupos) e do grupo (com itens).

## Hipóteses (reversíveis; a confirmar com o uso)
- Tamanho como **acréscimo** sobre o preço do produto, e não preço cheio por tamanho: o preço do
  produto é o do menor tamanho e a tela mostra o preço final de cada tamanho na prévia.
- Adicional grátis é permitido (preço 0), para escolhas como ponto da carne e molho.
- Combos e foto vêm nas próximas partes do passo 3 (PRs próprios).
- Os adicionais ainda não baixam estoque: a ficha técnica de cada adicional entra na E12, junto
  com a do produto (RC-01). Nada de baixa nesta parte.

## Alternativas descartadas
- Preço cheio por tamanho: obrigaria o produto a ter dois "preços base" que podem se contradizer.
- Adicionais soltos por produto (sem grupo): repetir "Bacon extra" em 20 lanches e mudar o preço em
  20 lugares.
- Preço do delivery calculado por percentual: o responsável disse "preços diferentes", não uma
  regra; um percentual pode ser um atalho na tela no futuro.

## Consequências
O pedido (E11) chama `calcularPrecoDoItem` dentro da transação dele e grava no item o preço e as
escolhas aplicadas (preço versionado no pedido). O cardápio do delivery (E26) e a mesa (RC-20) usam
o canal certo. A importação de planilha continua criando produto com o preço da loja; preço do
delivery, tamanhos e adicionais são cadastrados na tela.

## Critério de aceite e evidência
`packages/dominio/testes/produtos-completos.teste.ts` (PostgreSQL real): preço do delivery nulo e
próprio; tamanhos (ordem, troca de nomes, tirar e trazer de volta, repetidos pelo jeito do banco de
comparar, id de outro produto); grupos (mínimo e máximo, obrigatório sem itens, itens de outro grupo,
permissões, auditoria); preço do item nos dois canais com mínimo, máximo, vezes por item, repetidos,
formato inválido, inativos e canal desconhecido; concorrência ao desativar grupo. Matriz da API com
as rotas novas. Testes de tela de Produtos e Adicionais.
