# Agenda das sugestões aprovadas (memória entre chats)

**Aprovadas todas pelo responsável em 18/11/2026, na ordem abaixo.** Pedido dele: o Claude tem que
saber e lembrar sozinho quando cada uma entra, em qualquer chat. Por isso:
- o hook de início de sessão mostra as linhas **pendentes** desta tabela em todo chat novo;
- `docs/03-roteiro-de-fases.md` marca cada sugestão na etapa em que ela entra;
- a skill `encerrar-sessao` confere esta agenda ao fim de cada assunto.

**Regra:** ao **começar** a etapa do gatilho, a sugestão entra no plano da etapa (ou num PR logo
depois) e é avisada ao responsável na mensagem do plano. Ao **terminar**, a linha passa para
"feita" com o PR. Nunca pular em silêncio: se não der para fazer, escrever aqui o motivo e a nova
etapa, e avisar o responsável.

Detalhe de cada uma: `docs/requisitos/RC-07-sugestoes-no-dia-a-dia.md`.

| Ordem | # | Sugestão | Gatilho (quando entra) | Situação |
|---|---|---|---|---|
| 1 | S4 | Perfil da empresa no Google | Já: é tarefa do responsável (👉); o lembrete "atualize no Google" entra com o CMS (E25.5) | pendente |
| 2 | S2 | "Hoje no almoço" | E25.5 (CMS completo) | pendente |
| 2 | S7 | Agenda de eventos | E25.5 (CMS completo) | pendente |
| 3 | S3 | Cardápio impresso em PDF | Logo depois da E25 (precisa da foto no produto) | pendente |
| 3 | S10 | Proposta em PDF para empresas | Logo depois da E25.3 (Para empresas) | pendente |
| 4 | S1 | Alergênicos calculados da ficha | Logo depois da E08 (fichas técnicas) | **feita** em 24/11/2026 (PR 127, migração 0020, decisão 0026). Lista inicial e "quem marca" a confirmar com o responsável e um nutricionista. Falta, junto do cardápio público (site/delivery): mostrar os selos lá com `alergenicosDoProduto` e o aviso ao gerente de prato "em conferência" |
| 5 | S5 | Cardápio por QR Code na mesa | **Absorvida pela ideia nº 11 (RC-20)**: a comanda pela mesa entra na E13; a geração dos QR pelo mapa de mesas, na E17 | pendente |
| 5 | S6 | Reserva de mesa e do espaço | Logo depois da E17 | pendente |
| 5 | S8 | QR Code de avaliação no recibo | Logo depois da E17 (e S4 feito) | pendente |
| 6 | S12 | Clube E-MOTION (pontos) | **Antecipado e ampliado pela ideia nº 12 (RC-21):** conta do cliente na E26; Clube (desconto pelo app, pontos, presentes) logo depois da E26 | pendente |
| 7 | S9 | Convênio de almoço para empresas | Logo depois da E21 (financeiro); reaproveita o desconto de funcionário da E17 | pendente |
| 8 | S11 | Vale-presente | Depois da E27 (pagamento online) e com o contador | pendente |
| 8 | S13 | Tempo de espera no site | Depois da E16 e de algumas semanas de dados reais | pendente |

### Desperdício por vencimento x dinheiro perdido (ideia nº 15, aprovadas todas em 25/11/2026)
Base já pronta na E09: perda com motivo "Venceu", relatório de perdas em R$ (custo médio), lotes com
validade, vencido bloqueado sozinho. Não mexe no RC-01; cada item é só leitura ou aviso.

| # | Sugestão | Gatilho (quando entra) | Situação |
|---|---|---|---|
| D1 | Dinheiro em risco: R$ que vence em 3 e 7 dias, por área e item (lote x custo médio), no painel do estoque e no resumo do dia | **E10**, num PR próprio depois das regras de reposição, junto do aviso "lote perto do vencimento" (RC-09) | pendente |
| D7 | Lembrete de vencido bloqueado há X dias sem perda registrada (uma vez por lote, para quem cuida da área) | **E10**, mesmo PR do D1 | pendente |
| D4a | Alerta na entrada quando a validade recebida for curta (dias mínimos por item, opcional) | **E10**, mesmo PR do D1 | pendente |
| D2 | Ao avisar "perto do vencimento", mostrar os pratos que usam o ingrediente (fichas técnicas) e sugerir prato do dia/promoção (sugestão, nunca automático) | Logo depois da E10 (precisa do aviso D1); a promoção usa o simulador do RC-16 | pendente |
| D3 | Compra ajustada: item com perda por "Venceu" frequente tem a sugestão da lista de compras reduzida e aviso de embalagem menor (o responsável aprova) | Na lista de compras (frente LC3), com algumas semanas de dados reais | pendente |
| D4b | Desperdício por fornecedor (perda por vencimento e validade média na entrega) | Calculadora "Desperdício" do RC-16 | pendente |
| D5 | Meta mensal de desperdício: perda ÷ compras, mês a mês, aviso ao gestor ao passar da meta | Calculadora "Desperdício" do RC-16 | pendente |
| D6 | Sobra de produção ("Sobra descartada") x produzido no dia, sugerindo produzir menos | Depois da E14 (produção) e de algumas semanas de vendas reais | pendente |


## Para a E11 (anotado na E09, 25/11/2026)
- A mensagem "Sem saldo" de `consumirNaTransacao` ainda mostra quanto há: aplicar a regra da contagem cega (como `quantoHa`) quando o pedido usar a baixa.
- Contagem não aceita `chave` (toque duplo em "Começar a contar" só é barrado pela tela).
- E09 relatórios (revisão do PR 137, menores): mostrar na tela/CSV a quantidade aplicada quando a falta foi limitada pelo que havia; teste com falta limitada; teste do corte de 2.000 linhas com totais; teste da recusa do valor por área para cargo com uma área só. Formulário "Produzir" fora do teste de ajuda nos campos (precisa de preparo com ficha).


- (25/11/2026, revisor do PR 146) Estoque: atualizar a decisão 0027 (itens de recontagem) com a regra do envio lançado depois de contar. Risco antigo, dentro do item 14 da 0027: transferência dentro da área, perda ou entrada lançada depois da contagem, mas ocorrida antes, gera ajuste em dobro; avaliar pedir recontagem para qualquer movimento no item/local depois de contar. Aviso de envio pendente há muito tempo e mostrar na contagem os itens pulados por envio pendente.

## Para a E13 (anotado na frente visual-limpo, 25/11/2026, revisor do PR 152)
- As telas Mesas, Novo pedido e Produção já existem no visual do protótipo (PR 152): a E13 liga nelas, sem refazer a tela.
- `GET /api/cardapio` lista todo produto ativo: antes de ligar o envio, usar a disponibilidade calculada (RC-09/E12).
- Taxa de serviço (resposta de 25/11/2026): a casa NÃO cobra; criar configuração para ligar/desligar e a porcentagem
  (quem pode mudar: decidir com a matriz), gravada no pedido. Hoje `SERVICO_PORCENTO = 0` em `cardapio-comum.ts`.
- Comanda: tamanhos e adicionais, tipo Mesa/Balcão/Retirada/Delivery, "Guardar sem enviar", observação por item.
- Mesas: estado vem dos pedidos abertos; tempo na mesa, lista de espera e as 6 ideias do salão (ideias-do-cliente).
- Acessibilidade: teste de Escape/foco no popup da mesa (foco inicial antes do conteúdo existir), aria-current do
  botão grande "Novo pedido" no celular, `aria-label` em span da comanda, alvo de 44 px no link "Escolher a mesa".
- Foto do produto: liberada para quem lança pedido (`pedidos.lancar`), 25/11/2026.
