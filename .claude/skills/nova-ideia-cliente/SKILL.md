---
name: nova-ideia-cliente
description: Registrar e classificar uma ideia, pedido ou mudança vinda do cliente antes de qualquer implementação. Use sempre que o responsável disser "o cliente pediu", "tive uma ideia", "quero adicionar", "e se o sistema fizesse", ou trouxer funcionalidade que não está nos requisitos.
---

# Nova ideia do cliente

Não implemente na hora. Para cada ideia:

1. Escreva a ideia em uma frase, na linguagem do cliente, e o problema que ela resolve.
2. Verifique se já existe em `docs/requisitos/` ou em `cerebro/ideias-do-cliente.md` (evite duplicar).
3. Classifique:
   - **núcleo**: sem ela a primeira versão não atende ao RC-01 ou à operação diária;
   - **evolução**: útil, entra depois do núcleo estável;
   - **adiar**: depende de dado, hardware, terceiro ou volume que ainda não existe.
4. Descreva o impacto técnico em até 3 linhas (dados, telas, integrações) e as dependências.
5. Diga o que ela desloca: toda inclusão no núcleo empurra outra coisa.
6. Acrescente a linha em `cerebro/ideias-do-cliente.md` e, se for núcleo, proponha o ajuste no
   requisito correspondente para o responsável aprovar.

Seja franco: se a ideia aumenta o risco do núcleo, diga isso e proponha a versão menor.
