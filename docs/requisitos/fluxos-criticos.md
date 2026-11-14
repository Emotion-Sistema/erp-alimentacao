# Fluxos que precisam fechar

Para cada fluxo: regra escrita, teste automatizado quando possível e critério de aceite.

1. **Ciclo completo:** compra -> lote -> preparo intermediário -> venda -> consumo de
   estoque -> pagamento -> documento fiscal -> conciliação.
2. **Reserva sem pagamento:** prazo de expiração e risco de vender o mesmo item em dois canais.
3. **Cancelamento** antes e depois do preparo: perda física e reversão financeira são coisas separadas.
4. **Conta dividida**, pagamento parcial, estorno parcial e reabertura autorizada.
5. **Evento externo** duplicado, fora de ordem, com timeout ou com resposta desconhecida.
6. **Pedido pago com nota rejeitada:** os dois estados coexistem; contingência só quando aplicável.
7. **Troca de receita ou preço** sem alterar o histórico de vendas.
8. **Pedido com mais de uma área** (cozinha e cafeteria): tudo junto ou por partes, com contagem do que está pronto (RC-10).
9. **Queda de internet** com mais de um caixa: sincronização, conflito de comanda,
   prevenção de cobrança e nota duplicadas (na primeira versão: procedimento de
   contingência documentado, não offline coordenado).
10. **Restauração** do banco e dos arquivos, reprocessamento das filas e conciliação com
    pagamentos já efetivados fora do sistema.

## Fluxos de ponta a ponta
| Fluxo | Sequência |
|---|---|
| Mesa | Atendente lança (e pergunta tudo junto ou por partes) -> validação e baixa (RC-01) -> telas por tipo -> fila, preparo, pronto -> elevador / balcão da cafeteria -> aviso ao atendente -> entrega -> caixa recebe |
| Sorveteria 60 Sabores | Sistema da franquia -> leitura dos dados do dia -> painel do gestor (RC-11) |
| Compra | Mínimo gera solicitação -> aprovação -> compra -> recebimento conferido -> lote e validade -> estoque e contas a pagar |
| Produção diária | Responsável define quantidade -> produção consome insumos e gera preparado -> etiqueta -> venda consome o preparado |
| Delivery próprio | Carrinho -> reserva de estoque -> pagamento confirmado pelo provedor -> liberação e baixa (RC-01) -> produção -> expedição -> entrega -> conciliação |
| Pedido de iFood | Lançamento manual -> produção -> conferência -> saída registrada -> conciliação de taxa e repasse |
| Troca de turno | Equipe registra pendências e estoque crítico -> supervisor seguinte confirma |
