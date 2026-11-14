# 0005: site institucional e delivery próprio entram no escopo

- Data: 13/11/2026
- Status: aceita (pedido do responsável)
- Assunto da sessão: escopo

## Contexto
O planejamento anterior tratava delivery próprio e aplicativo do cliente como evolução.
O responsável definiu que haverá site institucional, delivery próprio pelo site com
pagamento online e aplicativo instalável para o cliente, além dos aplicativos internos.

## Decisão
- Três aplicações sobre o mesmo núcleo e o mesmo banco: `gestao` (interna), `loja`
  (delivery e app do cliente) e `site` (institucional). Regras de negócio em pacote
  compartilhado; nenhuma regra duplicada.
- A loja online e o aplicativo do cliente são a mesma aplicação web instalável (PWA).
- O pedido online entra no fluxo do RC-01; a liberação para a cozinha depende da
  confirmação autenticada do pagamento.
- Ordem: núcleo interno e RC-01 primeiro; o delivery vem depois de pagamento (F6), porque
  reutiliza os dois. O site institucional pode ser feito em paralelo, pois tem baixo risco.

## Consequências
Pagamento online, área de entrega e superfície pública passam a ser parte do projeto:
exigem provedor com ambiente de testes, limites de requisição, revisão de segurança e
teste de carga. A integração com iFood continua como evolução.

## Critério de aceite e evidência
Critérios de `requisitos/RC-07-...` e `requisitos/RC-08-...`.
