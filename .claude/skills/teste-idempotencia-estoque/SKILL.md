---
name: teste-idempotencia-estoque
description: Escrever e executar testes de baixa de estoque, concorrência e idempotência do RC-01 (pedido, ticket de cozinha, reserva, cancelamento). Use sempre que tocar em pedido, receita, saldo, reserva, outbox, webhook ou ticket, mesmo que não peçam testes.
---

# Testes de idempotência e estoque (RC-01)

Requisitos completos em `docs/requisitos/RC-01-pedido-cozinha-estoque.md` e
`docs/requisitos/RC-09-estoque-inteligente.md`. L = livre para venda = F - B - R.
Cenários mínimos, cada um com teste automatizado contra PostgreSQL real (não mock):

1. **Três setores:** um pedido gera um ticket por setor correto, baixa por receita/versão e vínculo de auditoria.
2. **Exemplos numéricos:** F=100, consumir 10 => F=90, L=90. Com reserva: F=120, R=20, L=100 => reservar 10 => R=30, L=90 => converter => F=110, R=20, L=90 (L não cai de novo).
3. **Última porção disputada:** dois pedidos simultâneos; só quem tem saldo confirmado avança; saldo nunca negativo sem autorização.
4. **Reenvio:** mesmo evento várias vezes => um consumo por item/revisão e um ticket lógico; reimpressão não consome.
5. **Falhas:** queda após gravar e antes de entregar => ticket entregue na recuperação; queda após entrega e antes do retorno => repetição sem duplicar.
6. **Preparo intermediário:** a venda consome o preparado, não as matérias-primas de novo.
7. **Cancelamento:** antes do preparo (reverte só com material utilizável) e depois (perda registrada, sem voltar ao saldo vendável).
8. **Alteração parcial:** movimentos só pela diferença.
9. **Em uso e guardado:** em uso 6, guardado 40, pedido consome 10 => transferência automática de 4, em uso 0, guardado 36, total 36, tarefa de abastecimento criada.
10. **Disponibilidade:** ingrediente compartilhado zera => todos os produtos dependentes ficam esgotados em todos os canais; entrada de estoque os devolve.
11. **Linhas e avisos:** cruzar a linha saudável gera um aviso só; cruzar a de emergência gera aviso urgente; vendas seguintes abaixo da linha não repetem.
12. **Uso do guardado:** a primeira venda que usa o guardado gera mensagem urgente ao responsável pelas compras; as seguintes do mesmo item não repetem.
13. **Produção (RC-10):** "Fila", "Pronto" e "Enviar" tocados duas vezes geram um aviso só; tempo do temporizador vem do servidor; pedido de duas áreas em "tudo junto" gera um único aviso ao atendente; estimativa de tempo bate com a conta manual para uma fila conhecida.
14. **Entregue x Pago:** atendente não consegue marcar Pago, nem pela tela nem direto no servidor; fechamento de caixa aprovado gera os lançamentos financeiros uma única vez.
15. **Botão "acabou" e venda autorizada sem saldo:** produto sai dos canais / venda registrada com autor; tarefa de contagem criada.

Entregue: testes, saída real da execução e lista do que não foi coberto.
