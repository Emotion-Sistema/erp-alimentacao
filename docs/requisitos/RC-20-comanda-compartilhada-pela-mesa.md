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
9. **Pagou, saiu da mesa (responsável, 19/11/2026):** assim que o caixa marca Pago a conta de um
   cliente (ou da mesa toda), **os aparelhos de quem pagou são desconectados da mesa na hora**: a tela mostra
   "Conta paga. Obrigado pela visita!" (com os pontos do Clube, se a pessoa for membro, e o convite
   para avaliar), a sessão da mesa acaba no servidor e o link daquela comanda não aceita mais nada.
   O mesmo vale quando o atendente fecha ou transfere a mesa. Sair da mesa não desloga a conta do
   Clube (RC-21).
10. **Entrar com o aplicativo E-MOTION:** na primeira vez, a página da mesa oferece "Entrar no Clube
   E-MOTION" (cadastro rápido, nunca obrigatório) e o desconto do aplicativo nos itens que o membro
   marca. Tudo no RC-21.

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

## 5. Decisões do responsável (19/11/2026)
- **Preço na mesa: SIM.** O cliente vê o preço de cada item e o total do que marcou (no site
  institucional continua sem preço).
- **Cada celular é "um cliente" naquela mesa.** Cada pessoa que mira o QR faz o **seu próprio
  pedido** no seu celular (aparece com o nome que digitar, ou "Cliente 1", "Cliente 2"; membro do
  Clube aparece com o nome do cadastro).
  - Todos os pedidos chegam ao atendente, separados por cliente, na mesma mesa.
  - **Juntos ou separados:** cada cliente toca **Encerrei** quando termina. O atendente confere e
    envia para a cozinha **cada cliente separado** (quem já decidiu não espera os outros) ou **todos
    juntos** (a mesa toda sai junto da cozinha; com o "terminar juntos" do RC-10, nada esfria).
    O atendente escolhe na conferência; o padrão é juntos quando todos já encerraram.
  - **Na hora de fechar a conta, cada um escolhe:** pagar **só o seu**, **juntar** com outros clientes
    da mesa (ex.: um casal) ou **a mesa toda junta**. O caixa (RC-13) já recebe a conta dividida por
    cliente, sem conta de cabeça; item dividido entre pessoas (ex.: porção para a mesa) pode ser
    rateado na conferência ou no caixa.
  - Quem paga a sua parte **sai da mesa** naquele celular (item 9); os outros continuam até pagar.
    Quando todos pagaram, a mesa fecha.
  - Os itens lançados pelo atendente para quem não usa o QR entram como "cliente sem celular" (ou o
    nome dito ao atendente) e seguem a mesma divisão.
- **QR opcional: SIM.** Em qualquer mesa o cliente pode só falar com o atendente, que lança tudo como
  hoje; dá para misturar (uma pessoa pelo celular, outra falando).

## 5b. Dividir a conta e dividir itens (responsável, 19/11/2026: "de forma muito perfeita, para não ter erro")
Exemplo: dois amigos pedem uma porção para os dois, seja pelo QR de um deles ou só pelo atendente.

**O que dá para fazer**
1. **Dividir um item** (ou vários) entre clientes escolhidos da mesa: em partes iguais (o padrão),
   por porcentagem ou por valor. Ex.: a porção entre os dois amigos; o vinho entre três de cinco.
2. **Dividir a conta inteira** em N partes iguais, ou cada um paga o seu.
3. **Misturar:** cada um paga o seu, e os itens marcados como "da mesa" se dividem entre quem
   escolher (ex.: cada um seu lanche, a porção e a jarra de suco no meio).
4. **Juntar** clientes numa conta só (um casal; alguém que paga para o outro).

**Quem divide**
- O cliente, pelo celular: "Dividir com..." escolhe os outros clientes da mesa; **só vale quando os
  outros aceitam no próprio celular** (ninguém ganha conta de outro sem querer). Quem não usa o QR é
  dividido pelo atendente.
- O atendente, na conferência ou a qualquer hora antes de pagar.
- O caixa, no fechamento (RC-13), que tem a palavra final e vê tudo.

**A conta exata (sem centavo perdido nem a mais)**
- Tudo em centavos inteiros. O valor de cada item já vem com adicionais e desconto (Clube, cupom ou
  funcionário, o maior; RC-21) aplicados antes da divisão.
- Dividir R$ 29,99 por 2 dá **R$ 15,00 + R$ 14,99**: o valor é repartido em centavos inteiros e o
  que sobra vai um centavo de cada vez para os primeiros da lista, numa ordem fixa (quem entrou
  primeiro na mesa). A tela mostra cada parte antes de confirmar.
- **Regra de ouro, conferida pelo banco:** a soma das partes de cada item é sempre exatamente o
  valor do item, e a soma das contas de todos os clientes é exatamente o total da mesa. Se não
  fechar, o sistema não grava (trava no banco, não só na tela).
- Porcentagem ou valor digitado: precisa fechar 100% / o valor do item; a tela mostra quanto falta.
- **Taxa de serviço** (se a casa cobrar, pendência 45): proporcional ao que cada um consome, pela
  mesma conta de centavos.

**Travas para não errar**
- **Parte paga não muda.** Depois que alguém pagou a sua parte, a divisão daquele item só muda nas
  partes ainda não pagas; o que já foi pago fica como está.
- **Item cancelado depois de pago** em parte: o valor volta para quem pagou por movimento
  compensatório (estorno ou crédito, decidido no caixa), nunca apagando o registro.
- **Duas pessoas mexendo ao mesmo tempo** (dois celulares, atendente e caixa): uma mudança espera a
  outra (trava da mesa, como na posição da lista) e quem chega depois vê a divisão já atualizada;
  pagamento repetido não cobra duas vezes (idempotência).
- **Cada celular mostra a conta do seu cliente**, item por item, com a parte de cada divisão
  ("½ Porção de batata: R$ 14,50"), e o total da mesa.
- Tudo registrado: quem dividiu, quem aceitou, valores antes e depois, com horário (RC-17).

**Critérios de aceite da divisão**
1. Em qualquer divisão (teste com milhares de combinações aleatórias de valores e pessoas), a soma
   das partes é exatamente o valor do item e a soma das contas é exatamente o total da mesa.
2. R$ 29,99 por 2 = R$ 15,00 + R$ 14,99; R$ 10,00 por 3 = R$ 3,34 + R$ 3,33 + R$ 3,33.
3. Divisão pelo cliente só vale com o aceite dos outros; o atendente e o caixa dividem direto.
4. Parte paga não muda; cancelamento depois do pagamento gera movimento compensatório.
5. Dois aparelhos dividindo e o caixa recebendo ao mesmo tempo: sem parte perdida, sem cobrança dupla.

## 5a. Fora deste requisito por enquanto
- **Balcão e viagem:** outro fluxo da E13.
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
2. Cada celular é um cliente com o próprio pedido; a conferência de um cliente abre com o "Encerrei"
   dele; o atendente envia separado (por cliente) ou junto (a mesa toda); "Voltar ao cardápio"
   destrava só o cliente conferido.
3. "Enviar para a cozinha" gera **um** ticket e **uma** baixa, mesmo com dois toques, dois aparelhos
   ou internet caindo (teste de concorrência e idempotência contra PostgreSQL real).
4. Depois de enviado, o aparelho do cliente não consegue tirar nem mudar item (recusado no servidor,
   não só escondido na tela).
5. Código de mesa errado, mesa fechada ou sem comanda: nada é gravado e a página diz o que fazer.
6. Item que acabou ou fora de horário não entra (servidor), com o motivo na tela.
7. O cliente vê etapas e tempo do seu pedido, e nada de outra mesa.
8. Tudo registrado com origem e horário.
9. Pago no caixa: os aparelhos de quem pagou saem da mesa em até 5 segundos e o link deixa de
   aceitar ação para eles (recusado no servidor); com tudo pago, a mesa fecha e todos saem.
10. Na conta, cada cliente escolhe pagar só o seu, juntar com outros clientes da mesa ou a mesa toda;
   o total confere com a soma dos itens, sem item cobrado duas vezes nem esquecido.
