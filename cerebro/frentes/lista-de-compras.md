# Frente: lista-de-compras (Central de Compras)

Aberta em 15/11/2026 pelo responsável. Situação: **proposta registrada, aguardando o "ok"**.
Nenhum código escrito. Ideia nº 3 em `cerebro/ideias-do-cliente.md`.

## O pedido, nas palavras do responsável
Quando faltar no estoque, o item vai sozinho para uma lista de compras dos gerentes. A lista
também recebe itens postos à mão. Os itens têm categoria, para que a leitura da nota fiscal
da compra já abata o que foi comprado. O sistema guarda o histórico de compras e mostra em
qual mercado cada produto sai mais barato, pela média das compras.

## O que já existia no projeto (para não duplicar)
| Parte do pedido | Onde já estava | Situação antes desta frente |
|---|---|---|
| Lista automática quando o estoque cruza a linha | RC-09 seções 4 e 5.1; etapa E10 | Previsto, não construído |
| Entrada de mercadoria em poucos toques | RC-09 seção 5.6; E09 | Previsto, não construído |
| Leitura de nota fiscal para dar entrada | RC-09 seção 6 | "Fica para depois" |
| Importar XML de compra, sem duplicar | RC-06 item 1 | Previsto, sem etapa |
| Compra recebida vira conta a pagar | RC-15; E30 | Previsto, bloco H |
| Quanto comprar de cada item | RC-16 (calculadora de mercadoria); E32 | Previsto, bloco H |
| Quem compra: gerente geral (estoque); financeiro e gerente (materiais) | RC-12, decisão 0011 | Ações `compras.*` já na matriz |

**Novo de verdade:** item manual, pedido da equipe, categorias, ligação nota x lista,
histórico de preço por local e comparação de onde comprar.

## Proposta: a Central de Compras
Uma tela só para os gerentes, com quatro abas: **Lista**, **Compra em andamento**,
**Preços** e **Notas**.

### 1. Lista (o que precisa ser comprado)
- **Três origens, uma lista só:**
  1. *Automática:* o estoque cruzou a linha saudável, a de emergência ou começou a usar o
     guardado (RC-09). Entra com a quantidade sugerida para voltar à linha saudável.
  2. *Manual:* o gerente escreve o item (do cadastro ou texto livre, ex.: "pano de prato").
  3. *Pedido da equipe:* qualquer funcionário pede um item no próprio aplicativo
     ("acabou o detergente"); cai como **pedido** e o gerente aceita ou recusa com um toque.
- **Sem duplicar:** o mesmo item aparece uma vez; novo motivo soma na mesma linha e mostra de
  onde veio (estoque, fulano pediu, gerente pôs).
- **Urgência com cor:** vermelho (emergência ou já tirou produto do cardápio), amarelo
  (repor), sem cor (manual). Cada linha mostra o "dura até" do RC-09.
- **Categorias** (corredor do mercado): hortifruti, carnes, frios e laticínios, mercearia,
  bebidas, padaria, congelados, descartáveis e embalagens, limpeza, materiais. A lista vem
  na ordem do corredor, para comprar sem voltar no mercado.
- **Item sai da lista sozinho** quando a compra é registrada (seções 2 e 4) ou quando o
  estoque volta acima da linha por outro motivo. Tirar à mão exige motivo.
- **Valor previsto da lista**, pelo preço de referência (seção 3), antes de sair de casa.
- Dois gerentes veem a mesma lista ao vivo; quem marcou "vou comprar" aparece na linha.
- Nada é apagado: item retirado, recusado ou comprado fica no histórico com autor e hora.

### 2. Compra em andamento (no mercado, com o celular)
- O gerente escolhe o **local** (mercado, atacado, feira, fornecedor) e vai marcando.
- Para cada item: quantidade, embalagem (ex.: caixa de 12, saco de 5 kg) e preço pago.
  O sistema converte para a unidade do estoque pelas conversões do cadastro (E07).
- Item fora da lista pode ser incluído na hora (compra de oportunidade).
- Ao terminar, tela de **conferência**: o que entra no estoque, em qual área, em uso ou
  guardado, validade quando houver. Só depois do "confere" é que o estoque recebe a entrada
  (compra sempre tem pessoa confirmando: decisão 0006).
- A compra pode ser preenchida à mão ou pela leitura da nota (seção 4): dá no mesmo.

### 3. Preços (onde é melhor comprar)
- Cada compra grava: item, local, data, marca, embalagem, quantidade, preço pago e o
  **preço por unidade comparável** (R$ por kg, por litro ou por unidade). É isso que permite
  comparar um saco de 5 kg de um lugar com um pacote de 1 kg de outro.
- **Preço de referência** de cada item em cada local: média das compras dos últimos 90 dias
  (prazo ajustável), pesada pela quantidade. Ao lado: último preço e data, menor preço já
  pago e quantas compras formam a média.
- **Franqueza do dado:** com menos de 3 compras aparece "pouco dado"; sem compra há mais de
  60 dias aparece "preço antigo". O sistema não finge certeza.
- Compra marcada como **promoção** fica no histórico, mas não puxa a média para baixo.
- **Ficha do item:** gráfico do preço no tempo por local e a tabela "mais barato em".
- **Melhor roteiro para a lista de hoje:** o sistema monta três opções com o valor previsto
  de cada uma: tudo no local mais barato no total; dividido em dois locais; o mais barato
  item a item. Mostra a economia de cada opção para o gerente decidir se a viagem compensa.
- **Avisos de preço:** item subiu mais que X% sobre a média (avisa o gerente e, depois da
  E08, mostra quais pratos ficaram mais caros); item bem abaixo da média ("bom momento
  para estocar", se a validade permitir).
- **Relatórios:** gasto por categoria, por local e por mês; itens que mais subiram; quanto
  foi economizado seguindo a sugestão.
- Marca: cada item pode ter marcas aceitas; a comparação respeita isso (não compara o
  queijo bom com o ruim).

### 4. Notas (ler a nota e abater a lista)
Como a nota vira compra:
1. A nota entra por um dos caminhos da tabela abaixo.
2. Cada linha da nota é ligada a um item do cadastro por um **dicionário que aprende**: na
   primeira vez o sistema sugere ("TOMATE ITAL KG" parece Tomate) e a pessoa confirma; dali
   em diante, a mesma linha do mesmo fornecedor casa sozinha. Código de barras, quando vem
   na nota, casa direto.
3. Linha sem par vai para a fila **"a classificar"**. O sistema nunca chuta uma entrada de
   estoque.
4. O que casou: abate o item da lista (parcial, se comprou menos que o necessário), grava o
   preço no histórico e prepara a entrada no estoque, que passa pela conferência da seção 2.
5. O que não é estoque (sacola, limpeza, material) tem categoria própria: não entra no
   estoque, mas entra no histórico de preço e no gasto.
6. **A mesma nota nunca entra duas vezes** (a chave de 44 dígitos é única).
7. O que estava na lista e não veio na nota continua na lista.

| Caminho | Como é | Confiança | Situação |
|---|---|---|---|
| Marcar à mão | Seção 2 | Total | Sempre existe |
| Arquivo XML da nota (NF-e) | Formato nacional padronizado; o fornecedor envia ou o contador baixa; já previsto no RC-06 | Alta | Primeiro a construir |
| QR Code do cupom (NFC-e) | O QR leva à página de consulta da Secretaria da Fazenda do estado | **A validar** | Não é um serviço oficial para sistemas, muda de estado para estado e pode bloquear consultas automáticas. Só prometo depois de testar no estado da loja |
| Foto do cupom lida por IA | Serve para qualquer papel | Média, sempre com conferência | **Adiar:** é serviço pago (exige confirmação específica do responsável) |

### 5. Mais adiante
- Quantidade sugerida mais esperta: consumo previsto x dias até a próxima compra,
  arredondado pela embalagem (calculadora de mercadoria do RC-16).
- Dia e local habituais de compra por categoria ("feira na quarta").
- Ligação com o financeiro: compra conferida vira conta a pagar ou despesa (RC-15, E30).
- Envio do XML ao pacote da contabilidade (RC-06, E31).

## Quem pode o quê (proposta, a confirmar)
| Ação | Quem |
|---|---|
| Pedir um item | Todo funcionário |
| Ver a lista, aceitar pedido, pôr e tirar item, registrar compra de estoque | Gerente geral, dono, administrador (`compras.estoque`, já existe) |
| Itens de materiais | Os mesmos e o financeiro (`compras.materiais`, já existe) |
| Ver preços e comparação | Quem compra. É custo da área, permitido ao gerente geral (RC-12) |
| Confirmar entrada no estoque | Quem compra; o estoque de cada área é avisado |

## Onde encaixa no roteiro e do que depende
Classificação: a lista (automática e manual) é **núcleo** e já estava na E10. Preços,
roteiro e leitura de nota são **evolução**: não podem atrasar o RC-01.

| Parte da frente | Entrega | Depende de | Crítico? |
|---|---|---|---|
| **LC1** Lista manual, pedidos da equipe, categorias, locais de compra | Seção 1 sem a parte automática | **E07** (ingredientes, unidades, conversões, fornecedores) | Permissão: `revisor` |
| **LC2** Registrar compra e histórico de preço | Seções 2 e 3 (média, ficha do item) | LC1. A entrada no estoque depende da **E09** | Dinheiro e estoque: `revisor` |
| **LC3** Itens automáticos | Liga as linhas do estoque à lista | **E09 e E10** | Estoque: `revisor` |
| **LC4** Leitura de nota (XML) e dicionário | Seção 4 | LC2 | Idempotência: `revisor` |
| **LC5** Roteiro, avisos de preço, relatórios | Resto da seção 3 | LC2; custo do prato depende da **E08** | Não |
| **LC6** QR Code e foto | Seção 4, caminhos a validar | LC4 e validação externa | Superfície externa: `revisor` |

**Hoje nada pode ser construído com segurança:** a E07 (cadastros) está em andamento no chat
principal e tudo aqui se apoia nela. A frente começa pela LC1 assim que a E07 estiver na
`main`. Enquanto isso, só especificação.

## Combinações necessárias com o chat principal
1. **Lista de compras da E10:** a frente assume a lista; a E10 fica com as linhas e os
   avisos e apenas avisa a lista ("item X precisa de Y"). Evita duas listas.
2. **Entrada no estoque:** a frente não cria regra própria de entrada; usa a da E09.
3. **Migrações:** a frente vai precisar de números (LC1 em diante). Pedir no mural na hora.
4. **Requisito:** a especificação acima vira `docs/requisitos/RC-19-central-de-compras.md`
   quando o responsável der o "ok" (confirmar que o número 19 está livre).

## O que desloca
Nada no roteiro principal, se ficar nesta frente. Custo real: mais revisão crítica (entrada
de estoque por nota) e a E10 passa a ter um ponto de encaixe combinado.

## Riscos (franqueza)
- A comparação só vale o que as compras registradas valem. Sem registrar preço em toda
  compra, a média engana. Por isso a leitura de nota importa.
- Leitura de cupom por QR Code pode não ser viável no estado da loja. A versão segura é
  XML mais marcação à mão.
- Entrada de estoque errada por nota mal casada estraga a disponibilidade de venda (RC-09).
  Daí a fila "a classificar" e a conferência obrigatória.

## Aguardando do responsável
1. "Ok" para a proposta e para a ordem LC1 a LC6.
2. Estado (UF) da loja, para validar o QR Code do cupom.
3. As compras são feitas com o CNPJ da empresa na nota, ou cupom comum?
4. A equipe pode pedir item (com aceite do gerente), ou só os gerentes põem?
5. Locais onde compram hoje (mercados, atacados, feira, fornecedores).
6. O PR 20 (regras de frente) precisa entrar na `main` antes do PR desta frente.

## Histórico da frente
| Data | O que foi feito |
|---|---|
| 15/11/2026 | Frente aberta; ideia nº 3 registrada; proposta escrita; nenhum código |
