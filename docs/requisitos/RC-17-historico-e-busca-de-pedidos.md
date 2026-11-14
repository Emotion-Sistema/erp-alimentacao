# RC-17: registro de tudo e busca de pedidos

**Pedido do cliente:** tudo registrado (cada pedido que cada atendente fez, o horário),
e poder pesquisar um pedido e ver todo o caminho dele, do atendimento à entrega, com os tempos.

## O que fica registrado em cada pedido
Quem lançou, em qual aparelho, mesa ou canal, horário; cada item, alteração e
cancelamento, com autor e motivo; como o cliente quis receber (tudo junto ou por partes);
baixa de estoque; para cada item: chegou, entrou na fila, iniciou, ficou pronto, quem
fez cada toque; envio pelo elevador; aviso ao atendente e quando ele pegou; **Entregue**
(quem e quando); **Pago** (qual caixa, como e quando); documento fiscal; no delivery:
motoboy, saída, entrega e código de confirmação; estimativa prometida e tempo real.

Nada é apagado. Correção é sempre um novo registro que referencia o anterior.

## Duas situações separadas
| Situação | Quem muda | Valores |
|---|---|---|
| **Atendimento** | Atendente (ou motoboy, ou cliente na retirada) | Aberto -> Entregue |
| **Pagamento** | **Somente o caixa** (ou o provedor, no pagamento online) | A pagar -> Pago -> Estornado |

"Entregue" encerra o atendimento, não a conta. Pedido entregue e não pago fica visível no
caixa e segura a mesa. Pedido só é "Concluído" quando está entregue **e** pago.

## Busca
Por número do pedido, mesa, data e horário, atendente, cozinheira, caixa, motoboy,
cliente (nome ou telefone), produto, canal, situação, forma de pagamento e valor.

## Linha do tempo do pedido
Uma tela, de cima para baixo, com cada evento, horário, autor e o tempo gasto entre
etapas: espera até a cozinha ver, tempo na fila, tempo de preparo de cada item (comparado
ao padrão), espera no elevador, tempo até o atendente pegar, tempo até a entrega, tempo
até o pagamento. Atrasos em destaque. Dá para imprimir ou exportar.

## Relatórios derivados
Por atendente (pedidos, valor, tempo até entregar, cancelamentos); por cozinheira e
estação (itens, tempo médio, atrasos); por caixa; por motoboy; por produto; por horário.

## Privacidade e guarda
Quem vê o quê segue o cargo: atendente vê os próprios pedidos; supervisor, os do salão;
gerente e dono, todos. Dados pessoais de clientes só para quem precisa. Tempo de guarda
definido com o contador e o cliente.

## Critérios de aceite
1. Pedido de teste percorre todas as etapas e a linha do tempo mostra cada uma, com autor e horário.
2. Tentativa de alterar ou apagar um registro antigo é recusada.
3. Busca por cada filtro devolve o pedido certo.
4. Atendente marca Entregue e não consegue marcar Pago; o pedido aparece no caixa como aguardando pagamento.
5. Tempos da linha do tempo batem com os horários gravados.
