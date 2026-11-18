# RC-20: comanda compartilhada pela mesa (QR Code)

**Pedido do responsável (18/11/2026, ideia nº 11):** o cliente mira o QR Code da mesa e entra na
mesma comanda do atendente; o que o cliente marca aparece para o atendente. Quando os dois terminam,
o cliente toca **Encerrei**; o atendente vê que o cliente encerrou, confere os itens **em voz alta**
com ele e toca **Enviar para a cozinha**. Se houver erro, **Voltar ao cardápio**. Depois de enviado,
o cliente não altera, mas pode **chamar o atendente** para ajustar. O cliente acompanha pelo celular
o **tempo de preparo e as etapas** do pedido.

**Problema que resolve:** o atendente perde tempo anotando item por item na correria; o cliente
escolhe com calma, vendo foto e descrição; a conferência em voz alta pega o erro antes de a cozinha
começar; o cliente sabe quanto falta sem chamar ninguém.

Complementa: RC-01 (pedido e baixa), RC-09 (o que está à venda), RC-10 seção 8 (o que o cliente vê),
RC-13 (mesas e conta), RC-18 (avisos), RC-07 S5 (QR na mesa). Entra na **E13** (aplicativo do
atendente) e o modelo de dados nasce na **E11** (pedido).

## 1. Como funciona, passo a passo

1. **Atendente abre a mesa** no aplicativo do atendente (como já previsto na E13). Isso cria a
   **comanda** da mesa.
2. **Cliente mira o QR Code impresso na mesa.** Abre no navegador do celular, sem instalar nada e
   sem criar conta, a página da comanda daquela mesa: o cardápio (o mesmo cadastro de produtos,
   com foto, descrição, alergênicos e o que acabou) e a lista "Na comanda".
   - Mesa sem comanda aberta: a página mostra o cardápio só para ver e "Chame o atendente para
     abrir a mesa" (com o botão de chamar).
3. **Cliente e atendente escolhem ao mesmo tempo.** O que o cliente marca aparece na hora no
   aparelho do atendente, com o selo **"do cliente"**; o que o atendente lança aparece para o
   cliente. Cada um pode tirar o que ele mesmo marcou nesta rodada; o atendente pode tirar tudo.
   Observações por item (ex.: "sem cebola") também valem para os dois.
4. **Cliente toca "Encerrei".** A parte dele fica travada; no atendente aparece
   **"Cliente encerrou"** (com aviso e som curto), e o botão de conferência fica em destaque.
5. **Conferência em voz alta.** O atendente abre a tela **Conferir com o cliente**: a lista da
   rodada em letra grande, item por item, com quantidade e observação, quem marcou cada um e o
   total da rodada (se a casa mostrar preço, ver hipóteses).
   - **Tudo certo:** **Enviar para a cozinha**. A rodada vira pedido liberado para produção (RC-01):
     ticket nas telas do tipo certo (RC-10), baixa de estoque **uma única vez**, na mesma transação.
   - **Algo errado:** **Voltar ao cardápio**. A rodada destrava para os dois, o "Encerrei" do cliente
     volta a desligado e a conferência recomeça quando ele encerrar de novo.
6. **Depois de enviado, o cliente não altera.** Os itens enviados aparecem para ele como
   "Na cozinha", sem botão de tirar. Para mudar, o cliente toca **Chamar o atendente** (com o motivo
   rápido: "ajustar pedido", "pedir a conta", "outra coisa"), que chega ao atendente da mesa como
   aviso (RC-18). O ajuste é feito pelo atendente, pela regra da E13 (motivo obrigatório, aviso aos
   supervisores, movimento compensatório; nunca uma segunda baixa).
7. **Pedir mais depois.** Com a mesa aberta, cliente e atendente podem começar uma **nova rodada**
   (sobremesa, outro café): ela passa pelo mesmo "Encerrei" e pela mesma conferência.
8. **Acompanhar pelo celular** (RC-10 seção 8): por item, a etapa (Recebido, Na fila, Em preparo,
   Pronto, Entregue), o tempo previsto com contagem regressiva e o aviso quando fica pronto. Atualiza
   sozinho. O cliente nunca vê nome de funcionário, outra mesa nem dado interno.
9. **Mesa fechada** (conta paga no caixa, RC-13): a página do QR mostra "Esta mesa foi encerrada.
   Obrigado!" e o link da comanda deixa de valer.

## 2. Regras que não mudam
- **Só o atendente envia para a cozinha.** O cliente sugere; quem libera é sempre uma pessoa da casa,
  depois da conferência. O RC-01 não muda: a baixa e o ticket nascem só no "Enviar para a cozinha",
  uma vez, mesmo com clique repetido, internet caindo ou dois aparelhos tocando ao mesmo tempo.
- **Pagamento:** a página da mesa não cobra; quem marca Pago é o caixa (regra do sistema).
- **Disponibilidade e horário:** o cliente só consegue marcar o que está à venda naquela hora e
  naquele canal (RC-09; decisão 0016). Se um item acabar entre marcar e enviar, a conferência
  mostra "acabou" e o atendente troca com o cliente.
- **Preço aplicado** fica gravado no pedido na hora do envio (regra do sistema).
- **Tudo registrado:** quem marcou cada item (cliente, por aparelho, ou atendente), o "Encerrei", a
  conferência, o envio e cada "Voltar ao cardápio", com horário (RC-17).

## 3. Segurança (é uma página pública)
- O QR Code impresso leva a um endereço da **mesa** com um código longo e aleatório (não dá para
  adivinhar a mesa vizinha trocando um número). A gestão gera e reimprime os QR pelo mapa de mesas;
  reimprimir troca o código e o antigo para de valer.
- Só há o que marcar com a **comanda aberta pelo atendente**. Cada aparelho que entra recebe uma
  sessão própria daquela comanda, que acaba quando a mesa fecha.
- Como alguém de fora da mesa poderia usar uma foto do QR, nada do cliente vai para a cozinha sem a
  conferência do atendente, e o atendente vê **quantos aparelhos** estão na comanda (e pode tirar um).
- Validação no servidor, limite de requisições por aparelho e por mesa, nenhum dado interno exposto
  (regras do sistema). Revisão independente (`revisor`) obrigatória antes de ir para a homologação.

## 4. Telas
- **Cliente (celular, página pública, marca E-MOTION com modo escuro do aparelho):** cardápio por
  categoria com busca, botão grande "Adicionar"; barra fixa embaixo "Na comanda (3)" que abre a
  lista; botões **Encerrei** e **Chamar o atendente**; depois do envio, a linha do tempo de cada item.
- **Atendente (aplicativo Atendimento, celular):** na mesa, a comanda ao vivo com os itens "do
  cliente" e "do atendente"; selo "Cliente encerrou"; tela **Conferir com o cliente** em letra grande;
  **Enviar para a cozinha** (o botão cheio da tela) e **Voltar ao cardápio**; aviso de chamado.

## 5. Hipóteses (a confirmar com o responsável)
- **Preço na mesa:** mostrar o preço para o cliente da mesa (no site institucional não mostra). Sem
  preço, o cliente não sabe o total do que marcou; proposta: **mostrar**.
- **Várias pessoas na mesma mesa:** cada celular que entra marca os seus itens ("Pessoa 1", "Pessoa 2",
  ou o nome que a pessoa digitar). Ajuda a dividir a conta no caixa. O **Encerrei** vale por aparelho;
  a conferência fica liberada quando todos encerram ou quando o atendente decide conferir assim mesmo.
- **Sem QR (cliente sem celular ou que prefere falar):** o atendente lança tudo, como hoje; o fluxo
  com QR é opcional por mesa.
- **Balcão e viagem:** fora deste requisito por enquanto (são outro fluxo da E13).
- **Delivery próprio** (RC-08) continua com pagamento online e não usa a conferência do atendente.

## 6. Impacto técnico e onde entra
- **E11 (pedido e baixa):** o pedido já nasce com **comanda** e **rodada**; cada item guarda a
  **origem** (cliente com o aparelho, ou atendente) e a rodada tem estado próprio: *aberta* ->
  *cliente encerrou* -> *em conferência* -> *enviada* (ou volta para *aberta*). "Enviar" é a única
  passagem para produção, idempotente.
- **E13 (aplicativo do atendente):** comanda ao vivo, conferência, enviar, voltar, chamado.
- **Página pública da mesa:** app `loja` (já é o lado do cliente, com a marca e o modo escuro),
  em `/mesa/<código>`; tempo real por eventos do servidor (sem serviço pago).
- **Geração dos QR Codes** pela gestão, a partir do mapa de mesas (E17; RC-07 S5).
- **Acompanhamento** reaproveita o RC-10 seção 8 (E14/E16).

## 7. Critérios de aceite
1. Cliente e atendente marcam itens na mesma comanda e cada um vê o do outro em até 2 segundos.
2. Só com "Encerrei" de todos (ou decisão do atendente) a conferência fica disponível; "Voltar ao
   cardápio" destrava os dois.
3. "Enviar para a cozinha" gera **um** ticket e **uma** baixa, mesmo com dois toques, dois aparelhos
   ou internet caindo (teste de concorrência e idempotência contra PostgreSQL real).
4. Depois de enviado, o aparelho do cliente não consegue tirar nem mudar item (recusado no servidor,
   não só escondido na tela).
5. Código de mesa errado, mesa fechada ou sem comanda: nada é gravado e a página diz o que fazer.
6. Item que acabou ou fora de horário não entra (servidor), com o motivo na tela.
7. O cliente vê etapas e tempo do seu pedido, e nada de outra mesa.
8. Tudo registrado com origem e horário.
