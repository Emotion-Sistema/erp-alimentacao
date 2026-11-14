---
name: checklist-pr
description: Preparar e revisar pull requests do ERP antes de pedir merge. Use sempre que for abrir, atualizar ou revisar um PR, ou quando o responsável disser que uma entrega terminou.
---

# Checklist de PR

Monte a descrição do PR com:

- **O que mudou** (3 a 6 linhas) e **por quê**.
- **Evidência:** testes executados e resultado real. Não afirmar o que não rodou.
- **Dinheiro/estoque/permissão:** quais regras foram tocadas e quais testes as cobrem.
- **Migrações:** presentes? reversíveis? testadas?
- **Segredos:** nenhum token, senha, certificado ou `.env` incluído.
- **Documentação e cérebro:** `docs/` e `cerebro/00-estado-atual.md` atualizados.
- **👉 Como o responsável confere:** passos simples para validar na homologação, sem ler código.
- **Risco e reversão:** o que pode dar errado e como desfazer.
- **Pendências** conhecidas.

Com CI verde e checklist completo você pode juntar o PR na `main` (homologação).
Nada vai para a branch `producao` sem o responsável escrever "Publique tudo".
