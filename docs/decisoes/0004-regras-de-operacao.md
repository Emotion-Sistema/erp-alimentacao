# 0004: regras de operação do projeto

- Data: 13/11/2026
- Status: aceita (pedido do responsável)
- Assunto da sessão: organização

## Decisão
1. **Publicação só com "Publique tudo".** Produção é a branch `producao`; a `main` é a
   homologação. A implantação é feita pelo GitHub Actions quando `producao` recebe código.
   Alterações em servidor, DNS e painel de hospedagem de produção seguem a mesma regra.
   A frase vale só para a mensagem em que foi escrita.
2. **👉 marca tarefa do responsável.** Toda resposta termina com a seção `👉 Para você
   fazer`; itens abertos ficam em `cerebro/para-voce-fazer.md`.
3. **Cérebro.** `cerebro/` é a memória única; cada sessão grava a síntese ao encerrar.
4. **Aviso de contexto.** Um hook estima o uso de contexto e, a partir de 50%, pede o
   bloco `📋 COPIE E COLE EM UM NOVO CHAT`.
5. **Skills.** O Claude informa as skills em uso e propõe novas quando houver repetição.
6. **Merge na `main`** pode ser feito pelo Claude com CI verde, porque `main` não é o ar.

## Como é garantido
Hooks em `.claude/settings.json`: `ao-iniciar-sessao.sh`, `ao-enviar-mensagem.py`,
`proteger-publicacao.py`. São barreira forte, não absoluta. Reforços no GitHub: proteção
das branches `main` e `producao` e, se o plano permitir, aprovação obrigatória no
ambiente de produção do GitHub Actions.

## Limites conhecidos
- O aviso de 50% usa o registro da conversa e um limite configurável
  (`ERP_CONTEXTO_MAX`, padrão 200000). É estimativa. Precisa ser confirmado na primeira
  sessão real; se não disparar, vale a regra escrita (conversa longa ou pedido do responsável).
- Sessões abertas ao mesmo tempo só compartilham o que já foi juntado na `main`.

## Critério de aceite e evidência
Na primeira sessão: tentar um push para `producao` sem a frase (deve bloquear) e
verificar se o estado do cérebro apareceu no início.
