# RC-10: produção, telas, temporizador, estimativa de tempo e avisos

**Pedido do cliente:** telas na cozinha mostram o pedido recebido, com som a cada pedido
novo. A cozinheira pode colocar o pedido **na fila** (viu, mas está ocupada), **iniciar
o preparo** (dispara um temporizador com o tempo do produto, que muda de cor) e marcar
**pronto**. O atendente que fez o pedido é avisado no aparelho, com som e a mesa certa.
O cliente acompanha as etapas pelo aplicativo e vê uma **estimativa de tempo** que
considera a fila e o tempo de preparo do próprio pedido.

Completa o RC-01 (o pedido chega e baixa o estoque uma única vez).

## 1. Áreas de produção e telas
| Área | Onde fica | Como entrega | Telas |
|---|---|---|---|
| **Cozinha** | Andar de baixo | **Elevador** de carga até o salão | Geral, Hambúrgueres, Pratos e grelhados, Elevador |
| **Cafeteria** | Salão | No próprio balcão da cafeteria | Tela própria |
| **Sorveteria 60 Sabores** | Salão | Autoatendimento da franquia | **Fora deste sistema** (RC-11) |

As telas da cozinha são **por tipo de pedido, não por lugar**: cada tela é um filtro de
tipos de produto, configurável sem programação.

| Tablet | Fica | Mostra |
|---|---|---|
| Geral | Ponto de coordenação | Todos os pedidos da cozinha e a situação de cada item |
| Hambúrgueres | Na esteira de hambúrguer | Itens do tipo hambúrguer |
| Pratos e grelhados | Perto das panelas e do grill | Itens desse tipo |
| Elevador | Junto ao elevador | Todos os pedidos da cozinha por mesa: o que está pronto e o que falta; botão **Enviar** |

Cada produto tem um tipo. Criar um tipo novo ou outra tela é configuração.

## 2. Situações de cada item
| Situação | Quem muda | O que o atendente e o cliente veem |
|---|---|---|
| **Novo** | Automático, ao chegar | "Enviado à cozinha" |
| **Na fila** | Cozinheira toca em **Fila** | "A cozinha viu e colocou na fila" + posição na fila |
| **Em preparo** | Cozinheira toca em **Iniciar** | "Em preparo" + tempo previsto |
| **Pronto** | Cozinheira toca em **Pronto** | "Pronto" |
| **Enviado** (só cozinha) | Toque em **Enviar** na tela do Elevador | "No elevador" |
| **Retirado** | Atendente toca em **Peguei** | Sai das telas de produção |
| **Entregue** | Atendente toca em **Entregue** ao servir a mesa | Atendimento encerrado; a conta segue aberta até o caixa marcar Pago (RC-17) |

**Botão Fila:** confirma que a cozinha viu o pedido e ainda não começou. Para o som de
pedido novo daquele cartão e mostra ao atendente que não foi esquecido. Pular a Fila e
tocar direto em Iniciar também vale. Pedido "Novo" que ninguém tocou em um tempo
ajustável é destacado na tela Geral e avisado ao supervisor.

A marcação é **por item**, com atalho "tudo pronto" no cartão. Cada toque fica em nome
de quem está na tela da estação (login por código pessoal, RC-12).

**Correção de pedido:** o supervisor (ou o atendente, com autorização) altera o pedido no
aplicativo de atendimento. A cozinha recebe a alteração destacada e com som; item já em
preparo ou pronto exige confirmação da cozinha e pode gerar perda registrada. O
supervisor vê as telas de produção, mas não muda situações nelas.

## 3. Temporizador e cores
Cada produto tem **tempo de preparo padrão** no cadastro.

| Cor | Condição (ajustável) | Significado |
|---|---|---|
| Branco, piscando | Novo | Ninguém viu ainda |
| Azul | Na fila | Visto, aguardando vez |
| Verde | Em preparo, até 70% do tempo | No prazo |
| Amarelo | De 70% a 100% | Atenção |
| Vermelho, piscando | Acima de 100% | Atrasado |

- Relógio grande em contagem regressiva, com barra que se esvazia.
- Item Novo ou Na fila também muda de cor pelo **tempo de espera**, para pedido parado
  não passar despercebido.
- Cartões ordenados sozinhos: o mais urgente primeiro.
- O tempo é contado pelo servidor: tablet que desliga e volta mostra o relógio certo.
- Os tempos reais ficam registrados e, com o uso, substituem o tempo padrão nas
  estimativas e geram sugestão de correção do cadastro.

## 4. Sons
| Evento | Onde | Som |
|---|---|---|
| Pedido novo | Telas do tipo envolvido e Geral | Campainha marcante, repetida até alguém tocar em Fila ou Iniciar |
| Pedido alterado ou cancelado após iniciado | Tela afetada | Alerta próprio, cartão destacado |
| Item atrasado | Tela do item | Bipe curto, a intervalos |
| Pedido completo da cozinha | Elevador | Som curto |
| Pronto para buscar | Aparelho do atendente | Som próprio e vibração até o "Peguei" |

Todo som tem também sinal visual. Volume e som são configuráveis. Cada tela abre o turno
com o botão **"Ativar som"** e mostra aviso fixo se o som estiver desligado. Prever
caixa de som na cozinha (RC-04).

## 5. Pedido com mais de uma área
Cada área entrega o que é dela: a cozinha pelo elevador, a cafeteria no balcão dela. O
sistema **conta o que está pronto em cada área e junta**.

Quando o pedido da mesa envolve mais de uma área, o aplicativo do atendente pergunta, no
momento de lançar, **como o cliente quer receber**:

| Opção | O que o sistema faz |
|---|---|
| **Tudo junto** (padrão) | Coordena o início entre as áreas para terminarem perto uma da outra e avisa o atendente uma vez, quando **tudo** estiver pronto: "Mesa 12 completa: elevador + cafeteria" |
| **O que ficar pronto, pode trazer** | Avisa o atendente a cada área que conclui: "Mesa 12, 1ª parte: cafeteria" |
| **Estes itens antes** | O atendente marca o que vem primeiro (ex.: bebidas, entrada); esses itens têm aviso próprio e o restante segue como "tudo junto" |

- **Terminar juntos:** em "Tudo junto", o item ou a área mais rápida recebe a indicação
  "iniciar em X min", para nada esfriar nem derreter esperando.
- O atendente sempre vê, por mesa, o painel de cada área: pronto, em preparo, na fila.
- Em "Tudo junto", se uma área atrasar muito (limite ajustável), o atendente é avisado
  para decidir se leva a parte pronta.

## 6. Aviso ao atendente
- Aparelhos **Android da empresa**, usados só dentro da loja, com o aplicativo instalado
  e sempre aberto; tela não apaga durante o turno.
- O aviso vai para **quem lançou o pedido**: som, vibração e tela cheia com a mesa, os
  itens e **onde buscar** (elevador, cafeteria).
- Sem "Peguei" no tempo ajustável (padrão 60 segundos), vai para todos os atendentes do
  turno e para o supervisor. Atendente em pausa ou fora do turno: já nasce para todos.
- Faixa fixa no aplicativo com todas as mesas aguardando retirada.
- Itens que não passam por área de produção (ex.: bebida da geladeira) não entram nessa
  contagem; o atendente pega direto.

## 7. Estimativa de tempo
Mostrada ao **atendente** ao lançar, ao **cliente** antes de confirmar o pedido (loja
online e aplicativo) e durante o acompanhamento.

**Conta:**
1. **Espera na fila de cada tipo** = soma do tempo que falta dos itens à frente
   ÷ quantos itens aquele tipo consegue fazer ao mesmo tempo (capacidade, configurável
   por tipo e ajustável por turno).
2. **Preparo do pedido em cada área** = espera daquela fila + o maior tempo de preparo
   entre os itens do pedido naquela área (itens feitos em paralelo até a capacidade).
3. **Pedido pronto** = a área mais demorada (em "Tudo junto").
4. **Somar as etapas fixas**: conferência e elevador; embalagem; e, no delivery, o tempo
   de deslocamento da região de entrega.

**Regras para a estimativa ser confiável:**
- Usar os **tempos reais medidos** por produto, dia da semana e horário assim que houver
  dados; antes disso, o tempo padrão do cadastro.
- Prometer pelo lado seguro: usar o tempo que a cozinha cumpre na grande maioria das
  vezes, não a média. Chegar antes do prometido é bom; depois, não.
- Mostrar como **faixa e horário**, arredondados: "25 a 35 min, previsto para 20:15".
- **Recalcular ao vivo** conforme a fila anda. Se piorar além de um limite, avisar o
  cliente e o atendente com a nova previsão; não esconder atraso.
- Item marcado "Na fila" ou "Novo" conta como trabalho à frente; item "Em preparo" conta
  só o que falta no relógio.
- **Proteção automática:** quando a estimativa passa do limite definido pela casa, a loja
  online mostra o prazo maior com destaque ou entra em pausa (RC-08), e o gestor é avisado.
- Relatório **prometido x realizado**, para calibrar capacidades e tempos.

## 8. O que o cliente vê (aplicativo e link de acompanhamento)
- Linha de etapas: **Recebido -> Na fila -> Em preparo -> Pronto -> Saiu para entrega /
  Pronto para retirada -> Entregue**, com a etapa atual destacada e as concluídas marcadas.
- Detalhe por item: "Hambúrguer: em preparo. Batata: pronta. Café: na fila".
- Posição na fila enquanto aguarda ("2 pedidos na sua frente").
- Horário previsto e contagem regressiva, atualizados sozinhos.
- Aviso quando muda de etapa e quando a previsão muda.
- Cliente no salão pode acompanhar o pedido da mesa lendo um QR Code (sem instalar nada); é o mesmo
  QR com que ele pede junto com o atendente (RC-20).
- O cliente nunca vê nomes de funcionários, outros pedidos ou dados internos.

## 9. Delivery e retirada
Hoje: a cozinha embala e o pedido sobe pelo elevador. **Isso vai mudar**, então fica
como configuração, não como regra fixa:
- quem embala: cozinha ou expedição no salão;
- por onde sai: elevador ou outro ponto;
- quem libera para o entregador ou para o cliente.
Trocar é alterar a configuração; as telas se ajustam (a etapa "embalar" aparece na tela
de quem embala).

## 10. Uso com as mãos ocupadas
Botões grandes, texto grande, alto contraste, uma ação por toque. **Desfazer** por alguns
segundos. Observações e alergias em destaque. Canal visível (mesa, balcão, retirada,
delivery com horário prometido). Botão **"Acabou"** em cada item (RC-09). Reconexão
automática com a fila gravada; aviso grande se a conexão cair.

## 11. Sugestões incluídas
1. **Gargalo à vista:** a tela Geral mostra a fila e o atraso médio de cada tipo, para remanejar gente.
2. **Capacidade por turno:** o gestor informa quantas pessoas há em cada tipo; a estimativa se ajusta.
3. **Reabrir pedido:** subiu errado ou faltou item, o atendente devolve com um toque e volta com prioridade.
4. **Prioridade manual** na tela Geral (ex.: mesa que já reclamou), registrada com autor.
5. **Painel de desempenho:** tempo por produto, tipo e turno; atrasos; pico; prometido x realizado.
6. **Etiqueta da mesa** impressa no elevador (opcional).
7. **Senha na TV do salão** para retirada no balcão (liga com o RC-02).
8. **Aviso de fila cheia ao atendente antes de lançar:** "cozinha com 25 min de fila", para ele já informar o cliente.

## Fica para depois (evolução)
Botoeira física ou pedal; distribuição automática entre cozinheiras; estimativa com
previsão de demanda; rastreio do entregador no mapa.

## Critérios de aceite
1. Pedido com hambúrguer e prato aparece nas duas telas de tipo, na Geral e no Elevador,
   e toca nas duas.
2. Fila -> Iniciar -> Pronto mudam a cor e a situação; o atendente vê cada mudança.
3. Temporizador usa o tempo do produto; cores mudam nos limites; item parado muda pela espera.
4. Pedido com cozinha e cafeteria em "Tudo junto": um único aviso ao atendente, quando as
   duas áreas concluem, com os dois pontos de retirada. Em "pode trazer": um aviso por área.
5. "Enviar" no Elevador avisa o atendente certo, com a mesa certa; sem "Peguei", sobe para todos.
6. Toque duplo em qualquer botão não gera aviso em dobro.
7. Estimativa: com fila conhecida e tempos definidos, o valor calculado bate com a conta
   manual; muda quando um item à frente é concluído; aumenta quando entra pedido na frente
   por prioridade.
8. Acompanhamento do cliente mostra as etapas e os itens corretos e nenhum dado de terceiros.
9. Mudar "quem embala" na configuração move a etapa de tela, sem alteração de código.
10. Tablet desligado e religado volta com fila e relógios corretos.
11. 👉 Teste na cozinha real, com barulho, nos tablets e nos aparelhos dos atendentes.

## Depende de
Tempo de preparo e tipo de cada produto, capacidade de cada tipo por turno, tempo de
deslocamento por região de entrega, rede sem fio estável no andar da cozinha.
