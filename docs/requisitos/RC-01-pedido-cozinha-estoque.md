# RC-01: pedido automático na produção e baixa de estoque

**Pedido do cliente:** o pedido deve chegar sozinho à cozinha e já atualizar o estoque,
sem ninguém lançar ingrediente por ingrediente. É condição de aceite da primeira versão.

## Saldos (decisão 0006)
Cada ingrediente tem dois locais: **em uso** (pronto para uso imediato) e **guardado**
(reserva, usada quando o em uso acaba).

| Saldo | Definição |
|---|---|
| Físico (F) | Quantidade registrada, em uso + guardado. É saldo do sistema, conferido por contagem; não é medição do alimento real |
| Bloqueado (B) | Parte do físico imprópria para venda (quarentena, vencido) |
| Reservado (R) | Parte do físico comprometida com pedidos ainda não consumidos |
| Livre para venda (L) | **L = F - B - R.** Calculado, nunca gravado como estoque separado |

**Ordem de consumo:** primeiro o em uso. Se não cobrir, o sistema transfere do guardado
automaticamente (transferência não é consumo e não reduz o total) e consome, tudo na
mesma transação, e cria a tarefa de abastecer a linha. Disponibilidade para venda, linhas
de reposição e notificações estão no RC-09.

## Gatilho da baixa
Ao **confirmar e liberar o pedido para produção**, em UMA transação do banco:
1. resolver receita/versão, tamanho, adicionais, remoções e conversões de unidade;
2. travar os saldos envolvidos, sempre na mesma ordem (por identificador do ingrediente);
3. conferir saldo suficiente dentro da transação;
4. gravar pedido/revisão, detalhamento do consumo e movimentos de estoque;
5. atualizar saldos (e converter reserva, se houver);
6. gravar os tickets por setor e o evento na outbox.
Se qualquer passo falhar, nada é gravado.

Depois, o worker entrega os tickets aos setores. Tela, impressão, reimpressão, início do
preparo, fechamento da conta e pagamento **não** repetem a baixa.

Rascunho não consome. Reserva antes da liberação é opcional (pedido aguardando
aprovação), com prazo de expiração. Na conversão, a reserva cai junto com o físico e o
livre para venda não cai de novo.

A baixa na liberação é a política pedida pelo cliente. Baixar só no início do preparo é
alternativa que exige decisão explícita (pendência 6).

## Exemplos obrigatórios (viram testes)
| Momento | F | B | R | L |
|---|---:|---:|---:|---:|
| Sem reserva: antes | 100 | 0 | 0 | 100 |
| Sem reserva: liberar pedido que consome 10 | 90 | 0 | 0 | 90 |
| Com reserva: antes do novo pedido | 120 | 0 | 20 | 100 |
| Reservar mais 10 | 120 | 0 | 30 | 90 |
| Liberar: consumir 10 e baixar a reserva de 10 | 110 | 0 | 20 | 90 |

Com os dois locais (pedido que consome 10):

| Momento | Em uso | Guardado | F | L |
|---|---:|---:|---:|---:|
| Antes | 6 | 40 | 46 | 46 |
| Transferência automática de 4 (guardado -> em uso) | 10 | 36 | 46 | 46 |
| Consumo de 10 | 0 | 36 | 36 | 36 |

Resultado: tarefa "abastecer a linha" criada para o responsável pelo estoque.

## Da ficha técnica ao consumo
Consumo = quantidade vendida x quantidade do ingrediente na receita aplicável. Aplicar
rendimento e perda técnica uma única vez. Guardar no pedido a versão da receita e o
detalhamento calculado. O que limita a venda é o ingrediente, não o produto final:
insumos compartilhados entre receitas disputam o mesmo saldo.

**Preparo intermediário:** produzir 5 kg de molho consome tomate e demais insumos e cria
um lote de molho. A venda consome o molho, nunca os ingredientes de novo.

**Sorveteria:** fora deste requisito. É franquia com sistema próprio (RC-11).

## Modelo de dados mínimo
- `estoque_saldo` (ingrediente, local [em uso | guardado], físico, bloqueado, reservado),
  uma linha por par. Linhas de reposição e nível de abastecimento por ingrediente (RC-09).
- `estoque_movimento`, só de inserção: tipo (entrada, produção, reserva, consumo,
  transferência, perda, ajuste, estorno), quantidade, unidade, lote, local, motivo,
  responsável, vínculo com pedido/item/revisão, **chave de idempotência única**.
- `pedido`, `pedido_revisao`, `pedido_item`, `pedido_item_consumo` (detalhamento calculado).
- `ticket_producao` por setor, com estados e confirmação de recebimento.
- `outbox_evento`, gravado na mesma transação.

## Estados
- Pedido: rascunho -> confirmado -> em produção -> pronto -> entregue | cancelado.
- Item na produção: novo -> na fila -> em preparo -> pronto -> enviado (cozinha) ->
  retirado pelo atendente | cancelado. Telas, temporizador, estimativa e avisos: RC-10.
- "Entregue ao terminal" e "visto pelo operador" são coisas diferentes e ficam registradas.

## Entrega confiável ao setor
Banco e tela de cozinha não fazem parte de uma única transação. O compromisso é: pedido e
estoque consistentes, e entrega durável e monitorada, com repetição segura. A tela recebe
aviso em tempo real e, ao reconectar, busca a fila gravada. Sem confirmação do terminal,
repetir com o mesmo identificador e alertar o supervisor. Não prometer exibição
instantânea em terminal desconectado.

## Concorrência e alterações
- Dois pedidos disputando a última porção: trava por linha ou atualização condicional
  atômica; em conflito, repetir de forma limitada. Nunca decidir com base em consulta
  feita antes da transação.
- Reenvio e webhook repetido: mesmo identificador, nenhum novo consumo, nenhum novo ticket.
- Reimpressão: cópia identificada como reimpressão.
- Mudança depois de confirmado: nova revisão, movimentos só pela diferença, sujeita ao
  estágio do preparo e à alçada.

## Falhas
| Cenário | Regra |
|---|---|
| Insumo insuficiente | Não liberar. Mostrar ingrediente e quantidade faltante; oferecer substituição ou espera com aprovação. Se um canal externo já aceitou ou cobrou, abrir exceção e tratar cancelamento/reembolso |
| Cancelamento antes do preparo | Reverter só com confirmação de que o material segue utilizável; movimento compensatório; cancelar ticket |
| Cancelamento após o preparo | Estorno financeiro e perda física são registros separados; ingrediente não volta ao saldo vendável |
| Falha de envio ou de terminal | Manter pendente, repetir com o mesmo identificador, alertar. Não desfazer a baixa por causa de timeout |
| Loja sem internet | Sem coordenação entre canais não há saldo global em tempo real: limitar ou pausar canais (offline coordenado é evolução) |
| Restauração do banco | Reconciliar tickets, pedidos externos e pagamentos antes de reprocessar |

## Limite da automação
Baixa por receita é consumo teórico. Variação de porção, descarte, troca de ingrediente e
sobra exigem registro e inventário. O sistema deve permitir comparar teórico e contado.

## Critérios de aceite
1. Pedido com itens de três setores: tickets certos, baixa por receita/versão, auditoria.
2. Os exemplos numéricos acima reproduzidos, inclusive o de em uso e guardado.
3. Última porção disputada por pedidos simultâneos: nenhum saldo negativo sem autorização.
4. Mesmo pedido reenviado várias vezes: um consumo e um ticket lógico.
5. Queda depois de gravar e antes de enviar: ticket entregue na recuperação. Queda depois
   da entrega e antes do retorno: repetição sem duplicar.
6. Receita com preparo intermediário, adicionais e transferência: unidades e custos corretos.
7. Cancelamento, alteração parcial, falta de insumo e terminal desconectado: rastreáveis.
8. Meta inicial a medir (não é garantia): 95% dos pedidos recebidos no terminal em até
   3 segundos, com rede e serviços saudáveis, na carga combinada.
9. Demonstração com a equipe e inventário conferido.

Os itens 1 a 7 são testáveis na sessão de desenvolvimento. O item 8 e o 9 dependem de
homologação e da loja.
