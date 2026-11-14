# 0001: definições de estoque do RC-01

- Data: 12/11/2026
- Status: substituída por 0006
- Assunto da sessão: arquitetura e dados

## Contexto
O cliente pediu que o pedido atualize o estoque "guardado" e o "disponível". "Guardado"
pode ser o saldo físico registrado ou um local específico (depósito/freezer).

## Decisão
Físico (F), Bloqueado (B), Reservado (R) e Disponível (D = F - B - R), por ingrediente,
unidade e local. Disponível é visão calculada, não outro estoque. Baixa na confirmação e
liberação para produção, na mesma transação do pedido. Transferência entre depósito e
cozinha não é consumo.

## Alternativas descartadas
Dois estoques independentes debitados pela mesma venda: gera baixa duplicada.

## Consequências
Uma venda gera um consumo. Locais são opcionais até a confirmação do cliente.

## Critério de aceite e evidência
Os dois exemplos numéricos do RC-01 (sem reserva e com reserva) reproduzidos em teste.
