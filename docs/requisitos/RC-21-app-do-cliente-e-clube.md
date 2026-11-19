# RC-21: aplicativo do cliente E-MOTION e Clube de benefícios

**Pedido do responsável (19/11/2026, ideia nº 12):** um aplicativo da E-MOTION para os clientes;
quem pede pelo aplicativo tem desconto, num **clube de benefícios**. O aplicativo é instalável e o
cliente entra e faz o cadastro **na primeira vez que mira o QR Code da mesa**.

**Problema que resolve:** hoje o cliente é anônimo: a casa não sabe quem volta, não consegue
premiar o cliente fiel nem trazê-lo do iFood para o canal próprio. O desconto pelo aplicativo
paga o trabalho que o cliente faz de marcar o próprio pedido (o atendente atende mais mesas) e
cria o motivo para instalar.

**Desenho:** é **um aplicativo só** para tudo o que o cliente faz: pedir na mesa (RC-20),
delivery e retirada (RC-08), acompanhar o pedido (RC-10 seção 8) e o Clube. É o mesmo app `loja`
(web instalável, PWA): quem não instala usa no navegador; quem instala ganha ícone, tela cheia e
avisos. Não há um segundo sistema nem loja de aplicativos (Play Store e App Store são evolução,
só se fizer falta, RC-08).

Complementa: RC-20 (comanda pela mesa), RC-08 (delivery e app), RC-07 S12 (Clube de pontos, que
este requisito amplia), RC-13 seção 3a (desconto de funcionário), RC-17 (histórico), RC-18 (avisos),
RC-06 (fiscal).

## 1. A primeira vez, na mesa
1. O cliente mira o QR Code da mesa. Abre a página da mesa (RC-20) com uma faixa:
   **"Entre no Clube E-MOTION e ganhe X% neste pedido"** com dois botões: **Entrar no Clube** e
   **Agora não** (pedir como convidado). **Nunca obrigar:** o convidado pede normalmente, sem desconto.
2. **Cadastro em menos de 1 minuto:** nome, celular e, se quiser, data de aniversário (para o
   presente do mês) e alergias (para o cardápio avisar). Aceite claro do uso dos dados (LGPD),
   com link para a política de privacidade. Nada de senha.
3. **Confirmação do celular** com um código de 6 números (ver hipótese sobre o meio de envio). Sem
   confirmar, a pessoa pede como convidado e confirma depois.
4. **Instalar o aplicativo:** logo depois, um convite "Instale o app E-MOTION" com o passo a passo
   do aparelho (Android: botão Instalar; iPhone: Compartilhar > Adicionar à Tela de Início). Quem
   não instala continua no navegador, logado.
5. Da segunda vez em diante: mira o QR e já entra logado, direto na comanda.

## 2. O Clube de benefícios
- **Desconto do aplicativo:** os itens que o próprio cliente marca pelo aplicativo, logado, têm o
  desconto do Clube. O percentual, as categorias que participam, o teto por pedido e os horários
  são definidos pelo gerente na gestão (nada fixo no código).
- **Pontos** (RC-07 S12): cada real pago soma pontos; os pontos viram prêmios do catálogo do gerente
  (café, sobremesa). Pontos de pedido cancelado saem por movimento compensatório.
- **Níveis** (evolução): Bronze, Prata, Ouro pelo gasto dos últimos 90 dias, com benefícios maiores.
- **Presentes automáticos:** boas-vindas (no primeiro pedido), aniversário (no mês) e "sentimos sua
  falta" (cupom depois de N dias sem pedir), todos configuráveis e desligáveis.
- **Campanhas:** "pontos em dobro na terça", "café do Clube a R$ 5 antes das 10h". Aviso dentro do
  aplicativo à vontade; **mensagem fora dele (WhatsApp, e-mail) só com confirmação específica do
  responsável** (regra do projeto) e só para quem aceitou receber.
- **Indique um amigo** (evolução): os dois ganham quando o amigo faz o primeiro pedido.
- **Não acumula:** desconto do Clube, cupom, promoção e desconto de funcionário não se somam;
  vale o maior (mesma regra do RC-13 seção 3a). O cálculo é sempre no servidor.

## 3. O que mais o aplicativo faz (tudo com o mesmo login)
- **Na mesa:** pedir junto com o atendente, "Encerrei", acompanhar etapas e tempo, **Chamar o
  atendente**, ver a conta parcial da mesa e a parte de cada pessoa.
- **Delivery e retirada** (RC-08): endereço salvo, "pedir de novo", pagamento online.
- **Meus pedidos:** histórico com recibo; nota fiscal quando emitida (RC-06).
- **Favoritos e alergias:** o cardápio marca o que contém o que o cliente evita.
- **Avaliar** (RC-07 S8) depois do pedido.
- **Minha conta:** dados, aceites, sair de todos os aparelhos e **apagar a conta** (LGPD).

## 4. Quando o pagamento é feito, a pessoa sai da mesa (pedido do responsável)
- Assim que o **caixa marca Pago** a conta da mesa (ou, no futuro, o provedor confirma o pagamento
  online da mesa), **todos os aparelhos daquela comanda saem da mesa na hora**: a tela mostra
  "Conta paga. Obrigado pela visita!", os pontos ganhos e o convite para avaliar. A sessão da mesa
  é encerrada no servidor e o link daquela comanda deixa de aceitar qualquer coisa.
- **Sair da mesa não é sair do aplicativo:** a conta do Clube continua logada no celular (para ver
  pontos e histórico). Na próxima visita, mirar o QR de novo coloca a pessoa na comanda nova.
- A mesa também encerra a sessão dos aparelhos quando o atendente **fecha ou transfere** a mesa, e
  depois de um tempo sem uso com a conta paga ou a mesa vazia.

## 5. Segurança, dados e regras
- Conta de cliente separada das contas da equipe: o cliente nunca entra na gestão.
- Dado pessoal mínimo, finalidade clara, consentimento separado para receber ofertas, exclusão a
  pedido; dados de cliente nunca em teste (regra do projeto).
- Um celular confirmado por conta; limites contra criar várias contas para repetir presente de
  boas-vindas; o desconto só vale na comanda aberta pelo atendente e passa pela conferência (RC-20).
- Desconto e pontos ficam gravados no pedido com a regra aplicada (preço versionado, regra do sistema).
- Página pública: validação no servidor, limite de requisições, nada interno exposto, revisão
  independente antes de ir para a homologação.

## 6. Hipóteses e decisões do responsável
- **Percentual do desconto do aplicativo** e se vale para tudo ou só para algumas categorias.
- **Como chega o código de confirmação do celular:** SMS ou WhatsApp são **serviços pagos**
  (precisam de contratação, confirmação específica); a alternativa sem custo é o código por
  e-mail. Proposta: começar por e-mail e ligar SMS ou WhatsApp quando contratar.
- **Pontos:** quanto vale cada real e o catálogo de prêmios.
- **Texto de privacidade e de aceite:** revisar com o jurídico ou o contador da empresa.
- **Fiscal:** como o desconto aparece na nota (desconto no item) a confirmar com o contador; não
  inventar regra fiscal.

## 7. Onde entra no roteiro
- **E13** (aplicativo do atendente e comanda pela mesa, RC-20): a mesa funciona com **convidado**;
  a saída automática ao pagar entra quando o caixa marca Pago (E17/E18).
- **E26** (delivery próprio): **conta do cliente** (cadastro, confirmação, login sem senha) e
  instalação do aplicativo; daí a faixa "Entrar no Clube" passa a aparecer também na mesa.
- **Logo depois da E26** (antecipa o S12, que estava para depois da E28): Clube com desconto do
  aplicativo, pontos e presentes. Níveis e indicação depois, com dados reais.

## 7a. O que isto desloca
O S12 sai de "depois da E28" para "logo depois da E26" e cresce (desconto do aplicativo, presentes,
saída ao pagar). Nada do núcleo (RC-01, RC-09, RC-10) é atrasado: o Clube só lê o pedido e aplica
desconto pela regra do servidor.

## 8. Critérios de aceite
1. Convidado pede sem cadastro; cadastro leva menos de 1 minuto e não é obrigatório.
2. Desconto só nos itens marcados pelo membro logado, calculado no servidor, gravado no pedido, sem
   somar com outro desconto (vale o maior).
3. Pago no caixa: todos os aparelhos da comanda saem da mesa em até 5 segundos e o link para de
   aceitar ação (teste no servidor); a conta do Clube continua logada.
4. Pontos entram uma vez por pedido pago e saem por movimento compensatório no cancelamento.
5. Apagar a conta remove os dados pessoais e mantém só o que a lei e o fiscal exigem, sem nome.
