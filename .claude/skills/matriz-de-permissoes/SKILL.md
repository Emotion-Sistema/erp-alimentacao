---
name: matriz-de-permissoes
description: Mudar ou conferir o que cada cargo pode fazer, e ligar permissão em rota nova. Use SEMPRE que a tarefa criar rota na API, criar ação nova, mudar o que um cargo pode, quem dá cada cargo, ou quando o responsável perguntar "quem pode fazer X?".
---

# Matriz de permissões

Fonte única: `packages/dominio/src/permissoes.ts`. Decisão: `docs/decisoes/0011-...`.

## Rota nova na API
1. A lógica fica em `apps/gestao/src/servidor/rotas.ts` e chama uma função do domínio que
   começa por `exigir(db, ator, "<acao>")`. Nunca conferir permissão só na tela.
2. Acrescente a rota em `ROTAS` de `apps/gestao/testes/matriz-api.teste.ts`, com a ação e
   uma chamada que **não muda nada** quando permitida (corpo vazio ou alvo inexistente).
   Sem isso o teste de cobertura quebra o CI.
3. Rode `pnpm teste`: cada cargo sem a ação deve receber 403 e a recusa fica na auditoria.

## Ação nova ou mudança no que um cargo pode
1. Mude `ACOES` / `PERMISSOES` (e `ACOES_EXCLUSIVAS` se só quem faz o trabalho pode).
2. Mude a tabela `ESPERADO` em `packages/dominio/testes/matriz.teste.ts` (escrita à parte de
   propósito: duas mudanças conscientes).
3. Atualize a tabela da decisão 0011 (ou crie decisão nova se mudar regra do RC-12).
4. Nunca dê ação de `ACOES_FINANCEIRAS` a caixa ou gerente geral; nunca tire
   `pagamento.marcar_pago` da exclusividade do caixa (regras inegociáveis).
5. Mudança que o responsável não pediu: registre como hipótese e pergunte.

## Quem dá cada cargo
Mude `QUEM_ATRIBUI` e o teste "quem atribui cada cargo". O teste "quem dá um cargo já tem
todo o poder dele" precisa continuar passando.

## Conferir pela tela
`pnpm teste:tela` entra com cada cargo da semente e confere o menu e as páginas bloqueadas.

## Responder "quem pode fazer X?"
Leia `PERMISSOES` e responda com a tabela da decisão 0011, em linguagem simples.
