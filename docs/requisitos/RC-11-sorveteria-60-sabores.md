# RC-11: sorveteria 60 Sabores (franquia, sistema próprio)

**Definição do responsável (13/11/2026):** a sorveteria é uma franquia chamada 60 Sabores,
de autoatendimento, que já opera com o sistema de gestão da franquia (informado como
"Mollbyte"). Este projeto **não comanda nem cria nada dos sorvetes**: não cadastra
sabores, não controla o estoque deles, não registra a venda e não emite a nota deles.
O objetivo é **conversar com o sistema da franquia para extrair o que for necessário**.

**Complemento do mesmo dia:** o supervisor precisa fazer o estoque da 60 Sabores, então
este sistema terá uma **aba de controle dos potes de sorvete** (seção abaixo). A venda
continua sendo do sistema da franquia.

## O que fica fora deste sistema
Venda por peso, balança, caixa e fiscal da sorveteria. O RC-01 e o RC-10 não se aplicam
a ela, e não há baixa de sorvete por venda (a venda acontece em outro sistema).

## Aba "Potes de sorvete" (supervisor)
Controle por **pote**, que é como o estoque de buffet funciona na prática.

| Função | Como |
|---|---|
| Sabores | Lista dos sabores da franquia, ativa ou inativa. Cadastro simples, só para o controle |
| Recebimento | Potes recebidos por sabor, data, lote e validade |
| **Guardado** | Potes fechados no freezer de reserva |
| **Em uso** | Potes abertos no buffet (um por sabor em exposição) |
| **Troca de pote** | Um toque: "abri um pote novo de morango". O pote antigo é dado como consumido (ou com sobra registrada) e um pote sai do guardado. É o consumo da sorveteria |
| Perda | Descarte por validade, derretimento ou contaminação, com motivo |
| Contagem | Contagem rápida dos potes guardados por sabor; diferença com justificativa |
| Linhas de reposição | Linha saudável e de emergência por sabor, em número de potes (mesma lógica do RC-09) |
| Pedido à franquia | Lista de reposição sugerida por sabor, para o gerente geral fazer o pedido |
| Avisos | Sabor sem pote guardado, sabor em emergência, pote perto do vencimento, sabor em exposição sem reposição |
| Histórico | Consumo de potes por sabor, por dia e semana: mostra os sabores que mais saem |

Regras: o sistema não calcula venda nem peso; não mexe no sistema da franquia; a
reposição é comprada pelo gerente geral. Comparar potes consumidos com as vendas lidas
do sistema da franquia (quando houver) aponta perda fora do normal.

## O que queremos extrair (a confirmar com o cliente)
| Dado | Para quê | Frequência desejada |
|---|---|---|
| Vendas do dia (valor total, quantidade/peso, número de atendimentos) | Visão consolidada da casa para o gestor | Diária |
| Vendas por forma de pagamento | Fechamento e conciliação | Diária |
| Consumo de insumos da sorveteria | Lista de compras única, se o cliente quiser | Semanal |
| Vendas por horário | Entender picos junto com o restante da casa | Diária |

Tudo **somente leitura**. Os números da sorveteria aparecem no painel do gestor
identificados como "origem: sistema da franquia", sem se misturar ao estoque nem ao
caixa deste sistema.

## Situação da integração
**Não confirmada.** Pesquisa em 13/11/2026 não encontrou site, documentação pública nem
API de um sistema chamado "Mollbyte"; o nome pode ter outra grafia. **18/11/2026:** o responsável
informou que todo o caixa da E-MOTION usa hoje o **Mollsales**, parceiro da 60 Sabores e obrigatório
para os sorvetes; o site oficial confirma que o Mollsales é o sistema por assinatura da Mollbyte
(resumo em `docs/referencias/mollsales.md`; a página não fala de API). Pergunta-chave para a franqueadora: o sorvete precisa continuar registrado no
Mollsales quando o caixa da casa passar para este sistema? (sessão própria; afeta a virada). A franquia existe e
tem site próprio (sorveteria60sabores.com.br). Não presumir que existe API.

## Caminhos possíveis, do melhor para o mais simples
1. **API ou webhook** do sistema da franquia, se existir e a franqueadora autorizar.
2. **Exportação de relatórios** (CSV, Excel ou PDF) que o sistema já gere: importação
   agendada ou envio de arquivo pelo gestor.
3. **Relatório por e-mail** enviado automaticamente pelo sistema da franquia, lido por
   uma rotina.
4. **Documentos fiscais** emitidos pela sorveteria (XML), se o CNPJ for o mesmo ou o
   cliente tiver acesso: dão vendas com confiança, sem depender do sistema.
5. **Lançamento manual do fechamento diário** em uma tela simples (três ou quatro números).

Começar pelo caminho 5 (funciona no primeiro dia) e subir de nível conforme a resposta
da franqueadora. Construir atrás de uma interface única, para trocar o caminho sem mexer
no painel.

## Cuidados
- O contrato de franquia pode restringir acesso a dados ou integrações: perguntar antes.
- Não fazer raspagem de tela nem usar a senha de alguém para "robô" acessar o sistema da
  franquia sem autorização por escrito.
- Verificar se a sorveteria tem CNPJ próprio: muda fiscal e consolidação financeira.

## Presença nos outros canais (decidir com o cliente)
- Site institucional: página da 60 Sabores como apresentação, seguindo as regras de
  marca da franquia.
- Delivery próprio e comanda do salão: sorvete **não** é vendido por este sistema, a menos
  que o cliente e a franqueadora decidam o contrário (seria outro requisito).

## Critério de aceite
Painel do gestor mostra o resultado diário da sorveteria com origem e data identificadas;
a troca de caminho de coleta não altera o painel; nenhuma escrita é feita no sistema da
franquia. Na aba de potes: receber, trocar pote, registrar perda e contar mantêm o saldo
por sabor correto; cruzar a linha gera aviso ao supervisor e item na lista do gerente.
