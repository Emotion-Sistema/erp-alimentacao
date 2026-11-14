---
name: publicar
description: Colocar no ar (produção) o que está aprovado na main. Use SOMENTE quando a mensagem do responsável começar com "Publique tudo". Também use para explicar o que seria publicado quando ele perguntar "o que está pronto para publicar?" ou "posso publicar?", sem publicar nada.
---

# Publicar

"No ar" é tudo que o público ou a loja usa de verdade: site, delivery, sistema interno em
produção, servidor, DNS, domínio, painel da hospedagem.

## Se a mensagem NÃO começa com "Publique tudo"
Não publique. Mostre o que está pronto na `main` e ainda não está no ar, os riscos, e
termine com: `👉 Para publicar, envie: Publique tudo`.

## Se a mensagem começa com "Publique tudo"
1. **Conferir:** CI verde na `main`; nenhuma migração destrutiva; backup recente do banco
   de produção; itens 👉 que travam a publicação resolvidos. Se algo falhar, pare e explique.
2. **Listar** em linguagem simples o que vai entrar no ar (diferença entre `producao` e `main`).
3. **Publicar:** atualizar a branch `producao` com a `main` e enviar. O GitHub Actions
   faz a implantação no servidor com as credenciais guardadas no GitHub. Você nunca usa
   senha do servidor.
4. **Verificar:** acompanhar a implantação até o fim; conferir a página de saúde, o site,
   um pedido de teste em modo de teste e a fila da cozinha. Não diga "publicado" sem ver.
5. **Se der errado:** reverter para a versão anterior (procedimento em `infra/`), avisar o
   responsável e registrar no cérebro.
6. **Registrar:** versão publicada, data, o que entrou e o resultado em
   `cerebro/00-estado-atual.md` e no diário.

A autorização vale só para a mensagem em que a frase foi escrita. Ações que exigem
confirmação específica (apagar dados, fiscal real, cobrança real, serviço pago)
continuam exigindo, mesmo com "Publique tudo".

Termine com `👉 Para você fazer`: o que ele deve abrir e conferir no ar.
