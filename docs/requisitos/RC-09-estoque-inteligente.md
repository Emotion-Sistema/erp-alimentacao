# RC-09: estoque ligado à venda, com alertas e linhas de reposição

**Pedido do cliente:** com comanda virtual na loja e delivery pelo site, o que aparece
para vender tem de refletir o estoque, sozinho. As fichas técnicas dizem quanto cada
prato gasta; isso conversa com o estoque **em uso** (pronto para uso imediato) e com o
estoque **guardado** (usado depois que o em uso acaba). O responsável pelo estoque recebe
notificações no aplicativo sobre o gasto, e cada item tem uma linha **saudável** e uma
linha de **emergência** para reposição.

Este requisito completa o RC-01 (que trata da baixa) e vale para todos os canais.

## 1. Dois níveis de estoque
| Nível | O que é | Exemplo |
|---|---|---|
| **Em uso** | O que está na cozinha ou no balcão: pronto para uso imediato | Pote de molho aberto na bancada |
| **Guardado** | Reserva em depósito, freezer ou câmara, usada quando o em uso acaba | Caixas fechadas no depósito |

São dois locais do mesmo ingrediente. O total do ingrediente é a soma dos dois.

**Ordem de consumo:** a baixa da venda sai primeiro do **em uso**. Se não cobrir, o
sistema usa o **guardado** automaticamente: registra a passagem guardado -> em uso
(transferência automática, que não é consumo) e em seguida o consumo. Ninguém lança nada.
A venda continua normalmente. Sempre que isso acontece, os **gerentes gerais, que fazem as compras,
recebem uma mensagem urgente**: "começou a usar o estoque guardado de X" (decisão do
responsável, 13/11/2026), e quem cuida daquela área de estoque recebe a tarefa "abastecer a
linha: trazer X do guardado". Essa tarefa também nasce quando o em uso cai abaixo do
nível combinado.

**Nomes usados no sistema (para não confundir):**
- *Em uso* e *Guardado*: os dois níveis acima.
- *Bloqueado*: impróprio para venda (vencido, em quarentena).
- *Reservado*: comprometido com pedido ainda não liberado (ex.: delivery aguardando pagamento).
- *Livre para venda* = (em uso + guardado) - bloqueado - reservado. É calculado, nunca digitado.

## 2. Disponibilidade automática para venda
Para cada produto, o sistema calcula **quantas porções ainda dá para vender**: o menor
resultado de (livre para venda do ingrediente ÷ quanto a ficha técnica gasta), olhando
todos os ingredientes da receita, tamanhos e adicionais.

- Ingrediente compartilhado entre pratos é considerado: vender hambúrguer reduz o que
  sobra de todo prato que usa o mesmo pão.
- Preparo intermediário (molho, massa, recheio): conta o que está **pronto**. Matéria-prima
  crua não vira porção vendável sozinha; em vez disso o sistema avisa "produzir mais molho".
- **Chegou a zero:** o produto (ou o adicional, ou o tamanho) aparece como esgotado na
  comanda virtual, na loja online e no aplicativo, na hora. **Entrou estoque:** volta sozinho.
- **Poucas unidades:** selo "últimas unidades" para o atendente; na loja online, opcional.
- **Margem de segurança por canal:** o estoque do sistema é teórico (porção varia,
  há perda). Na loja online, segurar uma margem configurável por ingrediente crítico
  para não vender o que não existe. Na loja física, quem está no salão vê a cozinha.
- **Canal online é rígido:** sem saldo, não vende. **Loja física tem válvula:** supervisor
  pode autorizar a venda mesmo com saldo zerado no sistema (o físico pode estar certo e o
  sistema errado); a autorização gera automaticamente uma tarefa de contagem do item.
- **Botão "acabou" na cozinha:** a produção marca um item como esgotado com um toque,
  mesmo que o sistema mostre saldo. O produto sai de todos os canais e nasce uma tarefa de
  contagem para corrigir o saldo. É a correção mais rápida para a diferença entre teoria e realidade.
- A verificação que vale é sempre a feita dentro da transação do pedido (RC-01). O número
  mostrado na tela é informação, não garantia.

## 2a. Horários de venda (definido em 14/11/2026)
Dados do responsável: **cozinha fecha às 23h** (último pedido, em qualquer canal, loja ou
delivery) e a **loja fecha às 23h30**. Abertura: **9h** de sexta a domingo; **10h** de terça a
quinta. O delivery começa em horário diferente.

Como funciona:
- **Horário da unidade** por dia da semana: abertura, último pedido da cozinha e fechamento.
- **Horário de cada categoria por canal** (loja e delivery), por dia da semana, **preenchido à
  mão pelo gerente** numa grade simples (ex.: Almoço, loja, ter a dom, 11h às 15h). Categoria
  sem horário segue o horário da unidade.
- **Exceções por data** (feriado, evento, fechado) e **pausa manual** de um canal ou categoria.
- **Regra no servidor:** um produto só aparece e só é aceito num canal se, naquele momento,
  a unidade está aberta e antes do último pedido da cozinha, a categoria está no horário daquele
  canal, não há pausa e o estoque permite (seção 2). Fora do horário, o produto aparece como
  "disponível a partir das 11h" e o pedido é recusado pelo servidor, mesmo que a tela tente.
- Toda mudança de horário fica registrada com autor (RC-17).
- Entra no cadastro de categorias (E07) e na disponibilidade (E12).

## 3. Linhas de reposição
Cada ingrediente tem duas linhas sobre o total (em uso + guardado):

| Situação | Condição | Significado | Cor |
|---|---|---|---|
| Saudável | Acima da linha saudável | Tudo certo | Verde |
| Repor | Entre a linha saudável e a de emergência | Hora de comprar com calma | Amarelo |
| Emergência | Abaixo da linha de emergência | Comprar já; risco de faltar | Vermelho |
| Esgotado | Zero livre para venda | Produtos saíram do cardápio | Cinza escuro |

E um terceiro nível, só do **em uso**: o **nível de abastecimento da linha**. Abaixo
dele, gera tarefa de trazer do guardado (não é compra, é movimentação interna).

**Como definir as linhas**
- No início: valores informados pelo responsável pelo estoque, por ingrediente.
- Depois de algumas semanas de uso: o sistema **sugere** as linhas a partir do consumo real:
  - linha de emergência = consumo médio diário x dias que o fornecedor leva para entregar;
  - linha saudável = emergência + folga (dias de segurança escolhidos pela casa).
- A sugestão considera dia da semana (sábado gasta mais que terça). Quem decide é a
  pessoa: o sistema propõe, o responsável aceita ou ajusta, e fica registrado.
- Mostrar também **"dura até"**: no ritmo atual, este item acaba em tal dia.

## 4. Notificações
O estoque é dividido em **áreas**, cada uma com seu responsável (decisão 0008):

| Área de estoque | Quem cuida (linha, contagem, perda) | Quem compra |
|---|---|---|
| Alimentos da cozinha | Cozinheiras | Gerente geral |
| Bebidas dos freezers do salão | Supervisor | Gerente geral |
| Cafeteria | Supervisor | Gerente geral |
| Potes de sorvete 60 Sabores (RC-11) | Supervisor | Gerente geral |

Cada pessoa vê e movimenta só a própria área. Avisos de abastecer a linha, contagem e
"acabou" vão para quem cuida da área; avisos de compra (linha saudável, emergência,
começou a usar o guardado) vão para os **gerentes gerais**. Na cozinha, o aviso aparece
nas telas da estação e para a cozinheira titular. Chegam no aplicativo
(central de notificações) e como aviso no celular.
Cada uma tem prioridade, vínculo com o item e um botão de ação.

| Evento | Prioridade | Ação oferecida |
|---|---|---|
| Item cruzou a linha saudável | Normal | Colocar na lista de compras |
| Item cruzou a linha de emergência | Urgente | Comprar agora / registrar entrada |
| Item esgotou e tirou produtos do cardápio | Urgente | Ver produtos afetados / registrar entrada |
| Em uso abaixo do nível de abastecimento | Normal | Confirmar que trouxe do guardado |
| Começou a usar o estoque guardado de um item | **Urgente, para os gerentes gerais (compras)** | Colocar na lista de compras / ver quanto resta e "dura até" |
| Preparo intermediário acabando | Normal | Abrir ordem de produção |
| Lote perto do vencimento | Normal | Usar primeiro / registrar descarte |
| Consumo fora do normal (muito acima do esperado para as vendas) | Normal | Abrir contagem do item |
| Botão "acabou" ou venda autorizada sem saldo | Normal | Fazer a contagem |
| Resumo do turno ou do dia | Informativa | Ver consumo, perdas e lista de compras |

**Regras para a notificação ajudar em vez de irritar**
- Avisa **uma vez por cruzamento de linha**, não a cada venda. Só avisa de novo se o item
  se recuperar e cair outra vez. O mesmo vale para o aviso de uso do guardado: um por
  item a cada vez que o guardado começa a ser usado, não um por venda.
- Atenção de projeto: se a quantidade em uso de um item for pequena por natureza, o aviso
  urgente de uso do guardado vai tocar todo dia e perder força. Por isso ele pode ser
  desligado ou rebaixado por item, e a quantidade em uso deve ser dimensionada para
  durar pelo menos um turno.
- Urgente não lido é repetido e, depois de um tempo configurável, **sobe para o gestor**.
- Itens agrupados: "5 itens entraram em reposição" em vez de cinco avisos.
- Horário de silêncio configurável para o que não é urgente.
- Toda notificação pode ser marcada como "ciente" e fica no histórico com quem viu e quando.
- Os aparelhos internos são Android da empresa (decisão 0007): o aviso chega com som e
  vibração, e a central dentro do aplicativo guarda o histórico.

## 5. Sugestões incluídas
1. **Lista de compras automática**, agrupada por fornecedor, com a quantidade para voltar
   à linha saudável; o responsável revisa e aprova (compra nunca é automática).
2. **Contagem rápida guiada:** todo dia o aplicativo pede a contagem de poucos itens
   (os mais caros, os que mais divergem, os marcados com "acabou"). Mantém o estoque
   teórico honesto sem parar a loja para inventário.
3. **Primeiro que vence, primeiro que sai:** ao trazer do guardado, indicar o lote a usar.
4. **Painel do estoque em uma tela:** semáforo de todos os itens, "dura até", o que está
   afetando o cardápio agora.
5. **Aviso ao gestor de venda perdida:** quantas vezes um produto ficou esgotado e por
   quanto tempo (mostra o custo de não repor).
6. **Entrada de mercadoria simples:** registrar a compra recebida em poucos toques, já
   direcionando para guardado ou em uso.
7. **Sorveteria fora:** o estoque da 60 Sabores é da franquia e não entra aqui (RC-11).

## 6. Fica para depois (evolução)
Previsão de demanda por clima e eventos; pedido automático ao fornecedor; leitura de nota
fiscal para dar entrada; sensores e balanças conectadas; sugestão de produção diária.

## Critérios de aceite
1. Venda que cabe no em uso: baixa só do em uso.
2. Venda maior que o em uso: transferência automática do guardado e consumo, com total
   correto e tarefa de abastecimento criada.
3. Ingrediente compartilhado zera: todos os produtos que dependem dele ficam esgotados em
   todos os canais; entrada de estoque os traz de volta, sem ação manual.
4. Margem de segurança: loja online esgota antes da loja física, conforme configurado.
5. Cruzar a linha saudável gera um aviso; dez vendas seguintes abaixo dela não geram outros.
5a. Primeira venda que usa o guardado gera mensagem urgente aos gerentes gerais;
    as vendas seguintes do mesmo item não repetem.
6. Cruzar a linha de emergência gera aviso urgente; sem leitura, sobe para o gestor.
7. Botão "acabou": produto some dos canais e a tarefa de contagem aparece.
8. Venda autorizada sem saldo na loja física: registrada com autor e tarefa de contagem.
9. Sugestão de linhas calculada a partir de consumo simulado bate com a conta manual.
10. Tudo acima com dois pedidos simultâneos disputando o mesmo item, sem saldo negativo indevido.

## Depende de
Fichas técnicas reais, unidades e conversões, prazo de entrega dos fornecedores e a área
de estoque de cada item.
