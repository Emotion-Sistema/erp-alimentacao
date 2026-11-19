# 0023: combos (produtos completos, parte 3)

- Data: 19/11/2026
- Status: aceita
- Assunto da sessão: passo 3 do plano de 19/11/2026 (produtos completos)

## Contexto
O responsável pediu a base de combos pronta para a equipe só cadastrar (decisão 0018, respostas de
19/11/2026). RC-01: todo item vendido precisa chegar à tela certa da produção e baixar o estoque
pela ficha técnica de cada produto, uma vez.

## Decisão
1. **Combo é um produto** marcado como combo (migração 0017): tem categoria, preço da loja e do
   delivery, foto e grupos de adicionais próprios, como qualquer produto.
2. **Montado por partes** ("Lanche", "Bebida", "Acompanhamento"; até 6). Em cada parte o cliente
   escolhe **uma opção**; cada opção é um **produto do cardápio** (até 20 por parte), com
   **tamanho fixo** se o produto tiver tamanhos, e um **acréscimo** opcional (ex.: suco no lugar
   do refrigerante, + R$ 3,00), com acréscimo próprio no delivery opcional.
3. **O combo não passa pela produção como um todo** e não tem tamanho (o banco recusa combo com
   tipo de produção). Cada produto escolhido vai para a tela do seu tipo e baixa a sua ficha
   técnica (E11/E12). O preço do item devolve, além do valor, o produto e o tamanho escolhidos em
   cada parte, para isso.
4. **Preço** = preço do combo no canal + acréscimo de cada opção escolhida no canal + adicionais do
   combo. O preço dos produtos das opções não entra (o combo tem o seu). Regra única
   `precoDoItem`; o servidor relê tudo do banco.
5. **Na gravação:** opção precisa ser produto ativo, que não seja combo (nada de combo dentro de
   combo) nem o próprio, com o tamanho dele; nada repetido. **Na venda:** opção cujo produto saiu
   de venda (ou cujo tamanho foi tirado) fica indisponível, e o cliente escolhe outra.
6. Lista completa na gravação (como tamanhos): o que sai fica inativo, nada se apaga; auditoria
   com antes e depois do produto, com as partes.

## Hipóteses (reversíveis)
- Os adicionais dos produtos das opções não aparecem dentro do combo (só os grupos do próprio
  combo). Se fizer falta, a E11 pode oferecer os adicionais de cada opção.
- Uma opção por parte (nada de "escolha 2 salgados"): para isso, duas partes.

## Alternativas descartadas
- Combo como lista fixa de produtos sem escolha: não cobre "escolha a bebida".
- Preço do combo como soma dos produtos com desconto: o responsável quer preço próprio no cardápio.

## Critério de aceite e evidência
`packages/dominio/testes/combos.teste.ts` (PostgreSQL real): criar e listar; preço por canal com
acréscimo; uma opção por parte, da própria parte, nada repetido e formato; opção fora de venda e
tamanho tirado indisponíveis; regras de gravação (tipo, tamanho, ele mesmo, combo dentro de combo,
tamanho certo, repetidos, limites) com nada gravado nas recusas e o banco recusando combo com tipo;
editar mantendo ids e acréscimo do delivery, desmontar; combo com adicionais próprios.
