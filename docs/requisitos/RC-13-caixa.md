# RC-13: caixa

O caixa recebe tudo da loja, no mesmo computador em que os pedidos são acompanhados.
Precisa ser rápido para o operador e à prova de erro e de desvio para a casa. O caixa
não tem acesso ao financeiro: vê só a movimentação do próprio dia.

## 1. Abertura
- Uma **sessão de caixa** por operador e por terminal. Não se vende sem sessão aberta.
- **Fundo de troco** contado por cédula e moeda; o sistema soma. Diferença em relação ao
  que ficou do fechamento anterior é apontada e precisa de justificativa.
- Abertura registra operador, horário e terminal.
- **Checklist de início do turno** (pedido em 14/11/2026, ideia nº 2): ao entrar, caixa e
  supervisor veem uma lista de conferência e dão ok item por item antes de iniciar o turno.
  Inclui conferir e ajustar os **horários do dia** (loja, delivery, categorias), que já vêm
  preenchidos com o padrão. Itens da lista configuráveis pelo gerente; tudo registrado (RC-17).

## 2. Tela principal (caixa e pedidos juntos)
- **Painel de contas:** mesas e comandas abertas, com situação de cada uma: em
  atendimento, **entregue aguardando pagamento**, conta pedida. As que esperam pagamento
  há mais tempo ficam no topo e mudam de cor.
- **Mapa das mesas** (definido em 14/11/2026): visual claro de todas as mesas, mostrando as
  livres e as ocupadas com a situação de cada uma; **um toque na mesa abre as funções dela**
  (ver pedidos, conta, receber, juntar ou transferir). O caixa vê todos os pedidos.
- **Lançar pedido** de balcão, retirada e telefone direto no caixa (segue o RC-01).
- **Pedidos online:** já chegam pagos pelo provedor; o caixa só acompanha.
- **Botão "Pedir a conta"** no aplicativo do atendente faz a mesa aparecer destacada aqui.

## 3. Recebimento
- Dinheiro (com cálculo de troco), Pix, débito, crédito, vale-refeição e **pagamento misto**.
- Divisão da conta: por pessoa, por item ou em partes iguais. Pagamento parcial permitido;
  a conta só fecha quando o total está quitado.
- Taxa de serviço opcional, mostrada separada (pendência 45).
- **Só o caixa marca Pago.**
- **Maquininha avulsa (situação atual, um caixa):** a baixa é manual. O operador passa o
  cartão na maquininha, e no sistema escolhe a forma (débito, crédito, vale), a bandeira,
  digita o número do comprovante e marca Pago. O sistema não tem como saber se o cartão
  passou de verdade; por isso o fechamento compara o total do sistema com o relatório da
  maquininha, por bandeira, e aponta a diferença.
- **Pix:** recomendado já integrado desde o início (o sistema gera o código, o cliente
  paga e a confirmação chega sozinha), porque elimina conferência de comprovante.
- **Maquininha integrada** (o valor vai do sistema para o aparelho e a confirmação volta
  sozinha) é evolução: depende do contrato com a operadora e do modelo do aparelho.
- Pago: emite o documento fiscal (RC-06), libera a mesa e encerra a conta.
- Desconto, cortesia, cancelamento de item já lançado, estorno e reabertura de conta
  pedem **autorização do supervisor ou gerente** (código dele na hora), com motivo.

## 3a. Desconto de funcionário (regra real da casa)
**Dito pelo responsável em 18/11/2026: hoje, no dia a dia, todo funcionário da empresa tem 15% de
desconto nos produtos da loja.** O sistema já nasce com essa regra (E17).
- O caixa escolhe "Consumo de funcionário" e **o próprio funcionário se identifica** com o código
  pessoal dele (o mesmo login do sistema, RC-12). Sem a identificação do funcionário, não há
  desconto: o caixa não aplica por conta própria.
- O desconto é calculado pelo servidor sobre os itens elegíveis, em centavos (nunca número com
  vírgula), e fica gravado no pedido: percentual aplicado, funcionário, quem lançou e horário.
  Mudar o percentual depois não altera pedidos antigos.
- O percentual (hoje 15%) é configurável só por dono e administrador, com histórico.
- Funcionário desligado ou inativo perde o desconto no mesmo dia, sozinho.
- O caixa que compra para si chama outro caixa ou o supervisor para lançar (ninguém aplica desconto
  na própria compra).
- Relatório mensal na gestão: consumo e desconto por funcionário e total, para o gestor e o
  financeiro.
- **Respostas do responsável (18/11/2026):**
  - **Onde vale:** salão, balcão, retirada e **delivery próprio**. No delivery, os 15% valem sobre o
    total **já com o frete** (produtos + frete). No iFood não (preço e pagamento são do iFood).
  - **Vale na sorveteria 60 Sabores.** Hoje (18/11/2026) todo o caixa da E-MOTION usa o **Mollsales**,
    que a 60 Sabores exige para os sorvetes. Enquanto o sorvete for vendido no Mollsales, o desconto
    dele é dado lá. Como fica o sorvete quando o caixa passar para este sistema: RC-11 e plano de
    virada (sessão própria).
  - **Não acumula (corrigido pelo responsável em 18/11/2026):** não há desconto em cima de desconto.
    **Vale sempre o maior.**
  - **Pagamento:** na hora **ou na conta do funcionário** (ver abaixo).
- **Como "vale o maior" é calculado:** o servidor calcula, em centavos, o total do pedido com cada
  desconto possível (15% do funcionário; promoção; cupom) e aplica **só o que deixa o total menor**.
  Exemplo: lanche de R$ 40,00 com promoção de 10%: com a promoção fica R$ 36,00; com os 15% fica
  R$ 34,00; vale o do funcionário, R$ 34,00. No delivery a comparação inclui o frete (os 15% valem
  sobre produtos + frete). O pedido guarda qual desconto venceu e por quê. Hipóteses a confirmar:
  a comparação é pelo pedido inteiro (não item a item); resgate de prêmio do Clube (S12) não é
  desconto, é prêmio, e pode ser usado junto.
- **Conta do funcionário:** em vez de pagar na hora, o caixa escolhe a forma "Conta do
  funcionário" (só o caixa marca, como todo Pago; o funcionário confirma com o código dele). O
  pedido fica pago para a loja e o valor vai para o saldo devedor daquele funcionário, com extrato
  (data, itens, desconto, valor). O funcionário vê o próprio extrato no aplicativo dele. A conta é
  quitada no caixa (dinheiro, Pix, cartão), por inteiro ou em partes, ou na data combinada.
  Hipóteses a confirmar: fechamento no fim do mês; sem limite de saldo, mas o gerente recebe aviso
  acima de um valor que ele define; ao ser desligado, o saldo aberto aparece para o financeiro.
  **Desconto em folha de pagamento**, se a casa quiser, só depois de confirmado com o contador
  (regras trabalhistas): o sistema não decide isso sozinho.
- Ainda hipótese: é para consumo do próprio funcionário (não de parentes ou amigos); sem limite por
  dia; como aparece na nota fiscal, confirmar com o contador (E20).
- A mesma "regra de desconto por grupo" serve depois ao convênio de empresas (S9) e ao Clube (S12).

## 4. Durante o turno
- **Sangria** (retirada de dinheiro) e **suprimento** (entrada de troco): valor, motivo,
  quem autorizou, comprovante impresso ou digital.
- **Aviso de gaveta cheia:** acima do limite de dinheiro definido pela casa, o sistema
  sugere sangria.
- **Passagem de caixa** entre operadores: conferência conjunta e novo responsável.
- Gaveta só abre em venda em dinheiro, sangria, suprimento ou com autorização registrada.

## 5. Fechamento
- **Fechamento cego:** o operador conta o dinheiro e informa os totais por forma de
  pagamento **sem ver o valor esperado**. Depois o sistema mostra a comparação.
- Conferência da maquininha: totais do sistema por bandeira ao lado do total do aparelho.
- Diferença (sobra ou falta) exige justificativa e aprovação de supervisor ou gerente.
- Não fecha com conta aberta sem tratamento: transferir, cobrar ou registrar pendência.
- **Relatório de fechamento** claro: abertura, vendas por forma de pagamento, descontos,
  cancelamentos, sangrias, suprimentos, valor esperado, valor contado, diferença, assinaturas.
- O fechamento aprovado **alimenta o financeiro sozinho** (vendas, formas de pagamento,
  taxas, valores a receber de cartão). O caixa não vê esse lado.

## 6. Segurança
- Tudo registrado com operador, horário e terminal; **nada é apagado**, só estornado com motivo.
- Tela bloqueia sozinha por inatividade; volta com o código do operador.
- **Alertas ao gerente** de padrões que merecem atenção: muitos cancelamentos ou descontos
  por operador, gaveta aberta sem venda, estorno logo após pagamento, diferença de caixa
  recorrente, conta entregue e não paga além do tempo limite.
- Conta entregue e não paga não libera a mesa.
- Se a internet cair: procedimento de contingência documentado (anotar e lançar depois,
  com marcação de "lançado em contingência").

## 7. Entregas no caixa
- **Fila de expedição:** pedidos de delivery e retirada prontos, com tempo de espera.
- **Motoboys próprios:** atribuir uma ou mais entregas, ver quem está na rua e há quanto
  tempo, receber a **prestação de contas** (dinheiro recebido na entrega, entregas feitas,
  valores devidos ao motoboy). Detalhes no RC-14.
- **Motoboys do iFood:** registrar a retirada (código do pedido, nome ou placa, horário),
  para ter prova de que o pedido saiu.
- Retirada no balcão: conferir o código do cliente e marcar entregue.

## Sugestões incluídas
1. Atalhos de teclado e produtos favoritos, para o caixa não depender do mouse no pico.
2. Recibo e segunda via por QR Code ou impresso.
3. Espelho da conta para o cliente conferir antes de pagar.
4. Painel do dia para o próprio caixa: quanto vendeu, quantos atendimentos, sem dados financeiros da casa.
5. Conferência surpresa: gerente pode pedir uma contagem no meio do turno.
6. Pré-fechamento: aviso das contas abertas uma hora antes de fechar a loja.

## Critérios de aceite
1. Não vende sem sessão aberta; fundo de troco registrado por cédula.
2. Conta dividida com pagamento misto fecha no centavo; troco correto.
3. Atendente não consegue marcar Pago; caixa não consegue acessar financeiro (pela tela
   e chamando o servidor).
4. Desconto e estorno sem autorização são recusados; com autorização ficam registrados.
   Desconto de funcionário só com a identificação do próprio funcionário ativo; o valor bate no
   centavo com a conta manual, inclusive com promoção (vale o maior) e com frete; funcionário inativo é
   recusado; ninguém aplica na própria compra. Lançar na conta do funcionário e quitar em partes
   fecha no centavo, e o extrato mostra tudo.
5. Fechamento cego: valor esperado só aparece depois da contagem; diferença exige justificativa.
6. Fechamento aprovado gera os lançamentos no financeiro uma única vez (repetir não duplica).
7. Pagamento confirmado duas vezes pelo provedor gera um único recebimento.
8. Entrega atribuída a motoboy aparece no aplicativo dele; prestação de contas bate com o caixa.
