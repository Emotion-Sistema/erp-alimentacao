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


## Para a E11 (anotado na E09, 25/11/2026)
- A mensagem "Sem saldo" de `consumirNaTransacao` ainda mostra quanto há: aplicar a regra da contagem cega (como `quantoHa`) quando o pedido usar a baixa.
- Contagem não aceita `chave` (toque duplo em "Começar a contar" só é barrado pela tela).
- E09 relatórios (revisão do PR 137, menores): mostrar na tela/CSV a quantidade aplicada quando a falta foi limitada pelo que havia; teste com falta limitada; teste do corte de 2.000 linhas com totais; teste da recusa do valor por área para cargo com uma área só. Formulário "Produzir" fora do teste de ajuda nos campos (precisa de preparo com ficha).


- (25/11/2026, revisor do PR 146) Estoque: atualizar a decisão 0027 (itens de recontagem) com a regra do envio lançado depois de contar. Risco antigo, dentro do item 14 da 0027: transferência dentro da área, perda ou entrada lançada depois da contagem, mas ocorrida antes, gera ajuste em dobro; avaliar pedir recontagem para qualquer movimento no item/local depois de contar. Aviso de envio pendente há muito tempo e mostrar na contagem os itens pulados por envio pendente.
