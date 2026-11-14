# RC-14: entregas e aplicativo do motoboy

## Como funciona
1. Pedido de delivery fica **pronto** (RC-10) e entra na fila de expedição do caixa.
2. O caixa **atribui** a entrega a um motoboy próprio (ou a mais de uma, na mesma saída).
3. O motoboy recebe no aplicativo, com som: **aceita**, confere os itens e toca em **Saí**.
4. O cliente vê "Saiu para entrega" e a previsão (RC-10, seção 8).
5. Na entrega, o motoboy pede o **código de 4 dígitos** que o cliente recebeu no
   acompanhamento, digita e toca em **Entregue**. É a prova de entrega.
6. Ao voltar, **presta contas** no caixa.

## Aplicativo do motoboy
- Login próprio. Vê **somente** as entregas atribuídas a ele.
- Cada entrega: itens, endereço, referência, observações, valor a receber (se for
  pagamento na entrega) e troco a levar.
- **Abrir no mapa** com um toque (aplicativo de navegação do celular).
- **Ligar ou mandar mensagem** ao cliente por botão; o número só fica visível durante a entrega.
- Situações: recebida -> aceita -> saí -> cheguei -> entregue | não entregue (com motivo:
  ausente, endereço errado, recusou; foto opcional).
- **Problema na entrega:** botão que avisa o caixa na hora.
- **Meu dia:** entregas feitas, tempo médio, valores a receber da casa e dinheiro a devolver.
- Avisos por notificação e central interna (RC-18).
- Funciona como aplicativo instalável no celular; com sinal ruim, guarda o toque e envia
  quando a conexão voltar.

## Prestação de contas
- Por saída ou no fim do turno, o caixa vê: entregas do motoboy, dinheiro que ele recebeu,
  troco que levou, valor devido a ele (taxa por entrega ou outra regra da casa).
- O caixa confere, recebe o dinheiro e marca Pago nos pedidos de pagamento na entrega.
- Diferença exige justificativa e fica registrada.

## Pagamento na entrega (se a casa aceitar; pendência 15)
- Dinheiro: o pedido informa "troco para quanto" e o motoboy sai com o troco registrado.
- Cartão: maquininha levada pelo motoboy; o comprovante é informado na prestação de contas.
- Pix na entrega: evitar comprovante por foto. Preferir Pix gerado pelo sistema, com
  confirmação automática, que o motoboy mostra no celular.

## Motoboys do iFood
Não usam o aplicativo. O caixa registra a retirada (código do pedido, identificação,
horário). O pedido do iFood é lançado manualmente até a integração (evolução).

## Sugestões incluídas
1. **Agrupar entregas** da mesma região em uma saída, com ordem sugerida.
2. **Tempo de retorno estimado** de cada motoboy, para o caixa saber quando terá entregador.
3. **Aviso ao cliente** quando o motoboy sai e quando está chegando.
4. **Avaliação da entrega** pelo cliente, ligada ao pedido.
5. **Localização durante a entrega** (com consentimento do motoboy) para o cliente ver no
   mapa: evolução.

## Critérios de aceite
1. Motoboy vê só as próprias entregas; outro login não as acessa.
2. Código de confirmação errado não conclui a entrega; com o código certo, o cliente e o
   caixa veem "Entregue" na hora.
3. Toque em "Entregue" sem sinal é enviado ao reconectar, uma única vez.
4. Prestação de contas bate com os pedidos de pagamento na entrega; só o caixa marca Pago.
5. Entrega não realizada volta para a fila do caixa com o motivo.
