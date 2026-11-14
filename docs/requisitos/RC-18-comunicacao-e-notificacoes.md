# RC-18: notificações e comunicação interna

Todos os aplicativos (atendente, cozinha, cafeteria, caixa, supervisor, gerente, estoque,
financeiro, motoboy, dono) têm **dois canais**: o aviso no aparelho e a central interna.

## 1. Aviso no aparelho (notificação)
Som, vibração e texto curto, mesmo com a tela em outro lugar. Para o que exige ação
imediata: pedido pronto, pedido novo, estoque em emergência, entrega atribuída, conta
esperando pagamento, autorização pedida.

## 2. Central interna (dentro do aplicativo)
- **Caixa de avisos:** tudo que chegou para a pessoa, com situação (novo, visto,
  resolvido) e o botão de ação. Guarda o histórico.
- **Comunicados:** recados da gerência para todos, para um cargo ou para um turno, com
  **confirmação de leitura** e lista de quem ainda não leu.
- **Mensagens ligadas ao pedido:** conversa curta presa a um pedido, entre atendente,
  cozinha e caixa (ex.: "acabou o cheddar, pode trocar por prato?"), com respostas
  prontas de um toque. Fica na linha do tempo do pedido (RC-17).
- **Recados entre setores:** canais por setor (salão, cozinha, caixa, gerência).
- **Passagem de turno:** pendências deixadas para o próximo turno, com confirmação de quem recebeu.
- **Pedidos de autorização:** desconto, estorno, venda sem saldo: chegam ao supervisor ou
  gerente, que aprova ou nega no próprio aparelho.

## Regras
- Cada tipo de aviso tem prioridade (urgente, normal, informativo), destinatário por cargo
  e turno, e som próprio.
- Urgente não visto é repetido e sobe para o superior depois do tempo configurado.
- Agrupar para não cansar: "5 itens em reposição" em vez de cinco avisos.
- Horário de silêncio para o que não é urgente; fora do turno a pessoa não recebe avisos operacionais.
- Não é rede social: sem grupos livres, sem mídia pessoal. Tudo fica registrado e pode ser auditado.
- Mensagens a clientes (delivery) são outro assunto e seguem o RC-08.

## Sugestões incluídas
1. Respostas prontas configuráveis por setor.
2. Aviso falado nas telas da cozinha ("mesa doze alterou o pedido"), opcional.
3. Painel do gerente com avisos urgentes não vistos em toda a casa.

## Critérios de aceite
Aviso chega ao cargo e ao turno certos; urgente não visto sobe; comunicado mostra quem
leu; mensagem do pedido aparece na linha do tempo; quem está fora do turno não recebe
aviso operacional.

## Situação (14/11/2026)
E05 fez a base (decisão 0013): caixa de avisos com novo/visto/resolvido, comunicados com
confirmação de leitura, entrega por cargo ativo, unidade e turno, e aviso no aparelho com o
aplicativo aberto. O resto deste requisito tem etapa marcada na decisão 0013.
