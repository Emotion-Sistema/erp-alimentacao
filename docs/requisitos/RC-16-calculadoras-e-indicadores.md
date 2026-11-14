# RC-16: calculadoras e indicadores do negócio

Ferramentas prontas, alimentadas pelos dados do sistema, com a opção de simular valores
à mão. Cada resultado mostra a conta feita e de onde vieram os números.

## Calculadoras
| Calculadora | O que responde | Conta |
|---|---|---|
| **CMV real** | Quanto custou a mercadoria vendida no período | Estoque inicial + compras - estoque final |
| **CMV %** | Quanto do faturamento vira custo de mercadoria | CMV ÷ faturamento do período |
| **CMV teórico x real** | Quanto se perdeu entre a receita e a prática | Custo pelas fichas técnicas do que foi vendido, comparado ao CMV real; a diferença é perda, porção maior, erro ou desvio |
| **Custo do prato** | Quanto custa fazer uma porção | Soma dos ingredientes da ficha técnica, com rendimento e embalagem |
| **Rendimento (fator de correção e de cocção)** | Quanto sobra depois de limpar e de cozinhar | Peso bruto ÷ peso limpo; peso cru ÷ peso pronto; corrige o custo real do ingrediente |
| **Preço de venda** | Por quanto vender | Custo do prato, margem desejada, taxas do canal (cartão, plataforma), impostos informados pelo contador |
| **Preço por canal** | Quanto cobrar no salão, no delivery próprio e no iFood para ter a mesma margem | Preço de venda com as taxas de cada canal |
| **Margem de contribuição** | Quanto cada venda sobra para pagar as contas fixas | Preço - custos variáveis |
| **Ponto de equilíbrio** | Quanto precisa vender para não ter prejuízo | Custos fixos ÷ margem de contribuição média |
| **Mercadoria (quanto comprar)** | Quantidade a pedir de cada item | Consumo previsto x dias até a próxima compra + segurança - estoque atual, arredondado pela embalagem do fornecedor |
| **Escala de receita** | Ingredientes para produzir X porções | Ficha técnica multiplicada, com conversão de unidades |
| **Simulador de promoção e combo** | Se o desconto compensa | Margem antes e depois; quantas vendas a mais para empatar |
| **Custo da entrega** | Quanto custa cada entrega e qual taxa cobrar | Custo do motoboy ÷ entregas, por região |
| **Desperdício** | Quanto se perde e em quê | Perdas registradas em quantidade e valor, por motivo |
| **Custo de mão de obra** | Quanto da venda paga a equipe | Folha informada ÷ faturamento; somado ao CMV dá o custo principal do negócio |
| **Conversor de unidades e embalagens** | Caixa, quilo, litro, unidade, porção | Conversões do cadastro |

## Indicadores acompanhados
Ticket médio; vendas por hora e dia; produtos mais vendidos e mais rentáveis
(popularidade x margem, para decidir o cardápio); tempo médio de preparo e de entrega;
prometido x realizado; itens esgotados e venda perdida; giro e dias de estoque;
cancelamentos e descontos; desempenho por atendente e por canal.

## Quem vê
Dono, Administrador e Financeiro: tudo. Gerente geral: o que usa só os **custos da área
dele** (custo do prato, rendimento, mercadoria, escala de receita, desperdício, CMV em
valor da própria área); não vê CMV %, margem, ponto de equilíbrio nem nada que revele o
faturamento da empresa. Supervisor e cozinha: rendimento, escala
de receita, conversor e desperdício da própria área.

## Regras
- CMV real só é confiável com inventário de abertura e de fechamento do período: o
  sistema lembra e bloqueia o cálculo se faltar contagem, em vez de mostrar número errado.
- Todo resultado indica período, fonte e data. Simulação manual é marcada como simulação.
- Sugestão de preço é sugestão: mudar preço é decisão de pessoa, com registro.

## Critérios de aceite
Cada calculadora conferida contra um exemplo feito à mão, registrado no teste; CMV recusa
período sem inventário; perfil sem permissão não vê custos nem faturamento.
