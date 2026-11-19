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
2. **Cadastro com segurança total (responsável, 19/11/2026):** nome completo, **CPF**, **CEP** (o
   endereço se preenche sozinho: rua, bairro, cidade e estado; a pessoa completa número e
   complemento), **data de nascimento** e **alergias**. Mais um contato para entrar na conta e
   receber o código (celular ou e-mail, ver seção 6). Aceites claros e separados (seção 5a), com link
   para a política de privacidade. Nada de senha. Regras de cada campo na seção 5a.
3. **Confirmação** com um código de 6 números enviado ao contato. Sem confirmar, a pessoa pede como
   convidado e confirma depois.
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
- **Campanhas só pelo aplicativo, por notificação (responsável, 19/11/2026):** "pontos em dobro na
  terça", "café do Clube a R$ 5 antes das 10h". Toda campanha chega como **notificação do aplicativo**
  (e fica guardada em "Novidades" dentro dele); **nada por WhatsApp, SMS ou e-mail**. Só recebe quem
  aceitou receber ofertas e ligou as notificações; dá para desligar a qualquer hora, em um toque.
  No Android funciona no navegador ou instalado; no iPhone, só com o aplicativo instalado na tela
  inicial (limite do iPhone): quem não instalar vê as campanhas em "Novidades" ao abrir o app.
  O gerente cria a campanha na gestão (texto, público, dia e hora); envio só nos horários da casa,
  com limite de frequência (ex.: no máximo 2 por semana) para não incomodar. Cada envio fica
  registrado (quem criou, para quantos, quando).
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

## 5a. O cadastro, campo a campo (segurança total)
- **Nome completo:** obrigatório.
- **CPF:** obrigatório para o Clube; conferido pelos dígitos verificadores no servidor; **um CPF por
  conta** (não dá para criar outra conta para repetir presente). Guardado **criptografado** no banco,
  com a chave no cofre (nunca no código, no Git ou em log); para achar a conta pelo CPF o banco guarda
  só uma impressão irreversível (hash com segredo). Na tela aparece mascarado (***.456.789-**). Serve
  também para o **CPF na nota**, se o cliente quiser (RC-06).
- **CEP com endereço automático:** o CEP busca rua, bairro, cidade e estado num serviço público de
  CEP (ver seção 6); a pessoa só completa número e complemento. Se o serviço não responder, ela
  digita à mão; o servidor confere o formato. O endereço serve para o delivery (RC-08) e pode ter
  mais de um (casa, trabalho).
- **Data de nascimento:** obrigatória; mostra o presente do mês de aniversário. **Clube só a partir
  de 18 anos** (decidido em 19/11/2026): menor de idade pede como convidado.
- **Alergias:** opcional, por lista (glúten, lactose, amendoim, frutos do mar, ovo, soja e "outra"),
  para o cardápio avisar e o atendente ver um alerta na comanda. Pela lei, informação de saúde é
  **dado sensível**: pede um aceite próprio e destacado, só serve para avisar sobre alergia, nunca
  para campanha, e aparece para a equipe só como alerta na comanda (nunca numa lista de clientes).
- **E-mail:** obrigatório, é por ele que chega o código de entrada (seção 6). Celular opcional.
- **Aceites separados:** (1) uso dos dados para a conta e o Clube; (2) alergias; (3) receber
  ofertas por notificação. Só o (1) é obrigatório. Cada aceite guarda data, hora e versão do texto.
- **Segurança da conta:** sem senha; entra com código de 6 números que vale poucos minutos, com
  limite de tentativas (bloqueio temporário depois de errar); a sessão fica presa ao aparelho e
  pode ser encerrada de todos os aparelhos em "Minha conta". Trocar CPF ou contato exige novo
  código. Toda mudança de dado fica registrada (sem gravar o dado em claro no registro).
- **Quem na equipe vê o quê:** caixa e atendente veem só o nome e o alerta de alergia da comanda; o
  CPF completo nunca aparece na gestão (só os 3 últimos dígitos, para conferência); relatórios do
  Clube usam números totais, sem lista de pessoas, salvo para quem o dono autorizar.
- **Direitos do cliente:** ver os próprios dados, corrigir, baixar uma cópia e **apagar a conta**
  (ficam só os registros que a lei e o fiscal exigem, sem identificar a pessoa).

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
- **Código de entrada: por e-mail** (decidido pelo responsável em 19/11/2026; sem custo). O contato
  obrigatório do cadastro é o e-mail; o celular fica opcional. SMS só se um dia quiser (serviço pago).
  (Isto é só o código de entrar; campanha nunca vai por esses meios.)
- **Serviço público de CEP:** escolher na construção um serviço gratuito e conhecido, conferido na
  hora (não inventar API); o CEP sai do servidor, nunca com o nome ou o CPF junto.
- **Idade mínima do Clube: 18 anos** (decidido em 19/11/2026); texto dos aceites com o jurídico.
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
