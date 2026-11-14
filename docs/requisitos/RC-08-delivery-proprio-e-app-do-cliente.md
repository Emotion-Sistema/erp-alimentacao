# RC-08: delivery próprio e aplicativo do cliente

**Pedido do cliente:** a pessoa faz o pedido pelo site, paga, e todo o processo até a
cozinha funciona completo e sem erros. Também um aplicativo instalável para pedir.

**Desenho:** a loja online e o aplicativo são a MESMA aplicação web: quem acessa pelo
navegador usa como site; quem quiser instala no celular (PWA) e ganha ícone e tela cheia.
Não há um segundo sistema. O pedido online entra no mesmo fluxo do RC-01.

## Jornada do cliente
1. Abre a loja. Vê se a casa está aberta, a **estimativa de tempo calculada pela fila real
   da cozinha** (RC-10, seção 7) e a taxa para o seu endereço.
2. Monta o pedido: tamanhos, adicionais, observações. Só aparece como disponível o que o
   estoque permite vender (RC-09), com margem de segurança nos itens críticos.
3. Escolhe entrega (endereço dentro da área atendida) ou retirada.
4. Identifica-se de forma leve (nome e telefone; conta é opcional).
5. Paga: Pix ou cartão online. Opcionalmente, pagamento na entrega (decisão do cliente).
6. Recebe a confirmação e um link de acompanhamento em tempo real.
7. Acompanha as etapas (recebido -> na fila -> em preparo -> pronto -> saiu para entrega /
   pronto para retirada -> entregue), a situação de cada item, a posição na fila e o
   horário previsto, atualizados sozinhos (RC-10, seção 8).

## Regras que garantem "sem erros"
- **Pagamento antes da cozinha.** Pedido pago online só é liberado para produção quando
  chega a confirmação autenticada do provedor (servidor a servidor). O retorno da tela do
  cliente nunca libera pedido.
- **Reserva de estoque no fechamento.** Ao iniciar o pagamento, os ingredientes são
  reservados por prazo curto. Pagou: reserva vira consumo (RC-01). Expirou: reserva é liberada.
- **Um pedido, uma cobrança, uma baixa, um ticket.** Clique duplo, página recarregada e
  aviso repetido do provedor não duplicam nada (chave de idempotência por carrinho).
- **Pagou e faltou insumo, ou a loja fechou:** estorno automático e aviso claro, com registro.
- **Pix expirado ou cartão recusado:** pedido não entra; carrinho preservado para tentar de novo.
- **Preço e taxa calculados no servidor.** O valor enviado pelo navegador nunca é confiado.
- **Loja controla a demanda:** horário de funcionamento, pausa manual, prazo ajustável e
  limite de pedidos simultâneos por faixa de horário.
- **Cartão nunca passa pelo nosso servidor:** usar o campo/checkout do provedor.
- **Dados pessoais mínimos**, com consentimento, e exclusão a pedido.
- Emissão fiscal do pedido segue o RC-06.

## Do lado da loja
- Pedido online aparece nas filas dos setores como qualquer outro, marcado com canal e tipo.
- Embalagem e saída: hoje a cozinha embala e envia pelo elevador. Quem embala e por onde
  sai são configuração (RC-10, seção 9), porque isso vai mudar.
- Entrega por motoboy próprio com aplicativo, código de confirmação e prestação de contas
  no caixa (RC-14). Motoboy do iFood: retirada registrada pelo caixa.
- Painel do gestor: pedidos em andamento, atrasos, pausar loja, área e taxa de entrega.

## Aplicativo do cliente (instalável)
- Ícone, tela cheia, abertura rápida, último endereço e "pedir de novo".
- Funciona como site para quem não instalar.
- Avisos por notificação a cada mudança de etapa e quando a previsão muda. No Android
  funcionam direto; no iPhone do cliente, só para quem instalar o aplicativo na tela
  inicial. Por isso o link de acompanhamento é o canal garantido.
- Sem conexão: mostra o cardápio em cache e avisa que não dá para pedir.
- Publicar nas lojas de aplicativos é evolução e só se fizer falta.

## Aplicativos internos envolvidos
Atendimento, cozinha, cafeteria, caixa e gestor (RC-03). Sorvete não é vendido por este
sistema (RC-11).

## Sugestões (classificadas em `cerebro/ideias-do-cliente.md`)
Retirada com hora marcada, pedido agendado, cardápio por QR Code na mesa, cupom de
primeira compra, pontos, avaliação pós-entrega, aviso por WhatsApp.

## Fora da primeira entrega do delivery
Roteirização, rastreio do entregador no mapa, entregador terceirizado por API, carteira
digital, assinatura, integração com iFood.

## Critérios de aceite
1. Pedido pago por Pix e por cartão (ambiente de testes) chega às filas certas e baixa o
   estoque uma vez.
2. Confirmação de pagamento repetida 5 vezes: um pedido, uma baixa, um ticket.
3. Dois clientes disputando o último item: só um conclui; o outro é avisado antes de pagar
   ou é estornado.
4. Pix expirado, cartão recusado, loja pausada no meio do pagamento, endereço fora da
   área: comportamento correto e mensagem clara.
5. Valor adulterado no navegador é ignorado pelo servidor.
6. Link de acompanhamento atualiza sozinho e não mostra dado de outro cliente.
7. Teste de carga representativo do pico informado.
8. 👉 Roteiro de teste em homologação executado pelo responsável e por alguém da loja.

## Depende de
RC-01 pronto, provedor de pagamento com ambiente de testes, área e taxa de entrega
definidas, política de pagamento na entrega, identidade visual.
