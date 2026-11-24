# 0027: estoque por lote, área e local, com movimentos imutáveis e custo médio (E09)

- Data: 24/11/2026
- Status: aceita (custo médio e "validade na entrada" são hipóteses do responsável, fáceis de mudar)
- Assunto da sessão: E09, estoque (RC-09), completa por pedido do responsável (24/11/2026)

## Contexto
O RC-09 pede dois níveis por ingrediente (em uso e guardado), consumo do em uso com passagem
automática do guardado, livre para venda calculado (L = F - B - R), áreas com responsável
(decisão 0008) e histórico imutável (RC-17). O RC-01 exige que a baixa do pedido (E11) aconteça
uma vez, dentro da transação do pedido. O responsável pediu a E09 completa: lotes com validade,
compra em embalagem, dados da nota, rendimento real do preparo, contagem cega e rápida,
inventário, transferência entre áreas, desfazer e relatórios. Ela vai em 5 PRs.

Fatos: o ingrediente já tem unidade do estoque fixa (g, ml, un), área e conversões de compra
(`ingrediente_conversao`, ex.: "caixa" = 12 un); o preparo da casa é uma ficha de tipo `preparo`
com unidade de rendimento (decisão 0025). Hipóteses: custo médio (não "último preço"); um lote
por linha de entrada; vencido = validade antes de hoje no fuso da loja.

## Decisão
1. **Item de estoque** (`estoque_item`): um ingrediente ou um preparo. Guarda o total e o valor
   (centavos) de todas as áreas, e o custo da última compra com preço.
2. **Saldo** (`estoque_saldo`) por **lote, área, local e situação** (livre ou bloqueado). Lote
   (`estoque_lote`) tem validade e código opcionais e nasce de um movimento. O saldo é o único
   lugar que muda; nunca fica negativo (CHECK) e não se apaga.
3. **Movimento** (`estoque_movimento`, `_item`, `_linha`): entrada, saldo inicial, transferência,
   perda, bloqueio, desbloqueio, consumo, produção, ajuste, custo e estorno. Nada muda nem some
   (gatilhos). Por item guarda a mudança no total e no valor e **como ficou depois** (histórico
   pronto). Cada linha diz que pedaço de saldo mudou. A soma das linhas é o saldo; a soma dos
   movimentos é o total e o valor (`conferirEstoque`, rodado depois de cada teste).
4. **Consumo** (`consumirNaTransacao`, para a E11 chamar na transação do pedido): sai do em uso
   livre e não vencido, o que vence primeiro antes; se faltar, traz do guardado sozinho (linhas
   `automatica`, passagem e não consumo) e consome. Sem saldo: recusa; com venda autorizada
   (`permitirFalta`), consome o que há e grava o que faltou (para a contagem). Fração exata da
   ficha: o mesmo item soma exato e só então arredonda a 4 casas.
5. **Custo médio**: entrada soma o valor pago; saída leva a parte proporcional (arredondada);
   quem leva tudo leva o valor todo, e quantidade zero tem valor zero. Entrada sem preço usa custo
   médio, último custo ou custo de referência, e fica marcada como **estimada**.
6. **Vencido** não é consumido nem transferido; conta como bloqueado no livre. Na perda, o vencido
   sai primeiro. Compra com validade passada é recusada; no saldo inicial, o vencido que já está
   na loja entra **bloqueado** (para a contagem bater e alguém dar baixa como perda).
   O saldo inicial aceita item desativado no cadastro (o que está na loja tem de ser contado);
   a compra, não.
7. **Concorrência**: todo lançamento trava as linhas de `estoque_item` (FOR UPDATE) em ordem de id;
   itens novos nascem em ordem fixa. A permissão é conferida antes da chave e das travas.
8. **Repetição**: `chave` única por movimento com assinatura do conteúdo (sem o autor: o reenvio
   do mesmo pedido por outro aparelho é o mesmo lançamento); reenvio devolve o movimento gravado;
   mesma chave com outro conteúdo é recusada (trava consultiva pela chave). No consumo a chave é
   **obrigatória** (RC-01: a baixa acontece uma vez).
9. **Permissão por área**: cozinha = `estoque.cozinha`; bebidas do salão, cafeteria e sorvete =
   `estoque.salao`. Cada lançamento confere a área de onde sai (e a de onde entra, na entrada).
   Entre áreas, quem recebeu tem de cuidar da área de destino (hipótese: quem registra indica quem
   recebeu, sem confirmação no aparelho de quem recebe; confirmação pode vir depois). Valor em
   reais (informar ou ver) só com `custos.ver`.
10. **Cada um vê só a própria área**: painel, item e histórico mostram o saldo das áreas da pessoa;
   quem não vê todas as áreas não vê o total geral, o "depois" nem os movimentos sem linha nas
   suas áreas.

11. **Compras (PR 2, migração 0022)**: a entrada guarda fornecedor (ativo), número e data da nota,
   digitados; até 5 fotos da nota por entrada (WebP refeito, até 2000 px, um lado até 10 vezes o
   outro, 2 MB; a mesma foto não duplica). **Correção de custo** (`custos.ver`): movimento "custo"
   ligado à entrada, com o valor certo da linha (`valor_informado`); a diferença entra no estoque
   na proporção do que ainda resta dos lotes daquela entrada (o que já saiu saiu com o custo da
   época); nunca deixa valor negativo nem dá valor a item zerado. **Saldo inicial por planilha**:
   conferir e gravar, com correção no painel (ideia nº 13); um movimento por gravação, com a chave
   da conferência; avisa quando já houve saldo inicial (gravar de novo soma).

## Alternativas descartadas
- Saldo calculado só pela soma das linhas: lento e difícil de travar; o saldo materializado com
  a linha ao lado dá as duas coisas.
- Custo por lote (PEPS de custo): mais exato no papel, mas muda o custo do prato a cada lote e
  complica o ajuste sem lote; o custo médio é o padrão da casa (hipótese).
- Saldo negativo na venda sem saldo: esconderia a diferença; gravar o que faltou deixa a
  contagem corrigir.

## Consequências
- A E11 chama `consumirNaTransacao` com a chave do pedido e a fração exata da ficha.
- A E10 lê as linhas automáticas (começou a usar o guardado) e os totais para as linhas de
  reposição; a reserva (R) entra na E11.
- Próximos PRs da E09: compra com nota e foto, saldo inicial por planilha, correção do custo;
  produção de preparo com rendimento real e desfazer; contagens; telas e relatórios.

## Critério de aceite e evidência
`packages/dominio/testes/estoque.teste.ts` contra PostgreSQL real: em uso 6 + guardado 40,
consumo 10 → passagem automática de 4; custo médio e zerar; o que vence primeiro sai primeiro;
vencido e bloqueado fora do consumo; permissão por área e de custos; repetição; última porção
disputada (quem chega depois espera e recebe "sem saldo"); pedidos em ordem trocada sem impasse;
20 consumos simultâneos com passagem do guardado fecham exato; supervisor não vê o total nem o
histórico da cozinha; reenvio do consumo por outro autor. Testes de mutação: sem a trava do item ou
sem a trava da chave, os testes de concorrência falham. A ordem das travas é defesa a mais (um
único SELECT ... FOR UPDATE já trava na ordem lida); nenhum teste a isola.
