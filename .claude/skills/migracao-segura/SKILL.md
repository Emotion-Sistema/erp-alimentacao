---
name: migracao-segura
description: Criar ou revisar migrações de banco PostgreSQL de forma segura e reversível. Use SEMPRE que a tarefa envolver criar tabela, alterar coluna, índice, constraint, seed ou qualquer mudança de esquema, mesmo que o pedido seja só "ajusta o banco".
---

# Migração segura

1. Leia o esquema atual e as migrações existentes antes de escrever.
2. Escreva a migração versionada; inclua o caminho de reversão ou explique por que é irreversível.
3. Prefira mudanças compatíveis com a versão anterior do código (adicionar antes de remover; preencher dados em etapas).
4. Dinheiro: centavos inteiros ou decimal exato. Chaves de idempotência com restrição UNIQUE.
5. Tabelas de movimento (estoque, financeiro) são só de inserção; correção por movimento compensatório.
6. CNPJ como texto, nunca como número.
7. Rode a migração no PostgreSQL da sessão com dados sintéticos e cole a saída no PR.
8. Migração destrutiva ou em produção: pare e peça confirmação, com backup e reversão descritos.
9. Registre decisões de modelo em `docs/decisoes/`.
