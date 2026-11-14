---
name: encerrar-sessao
description: Gravar a síntese da conversa no cérebro do projeto e gerar o bloco para continuar em um novo chat. Use SEMPRE que um assunto terminar, quando aparecer o aviso automático de contexto (a cada 10%), quando a conversa estiver longa, ou quando o responsável disser "encerrar", "resumir", "compactar", "passar o bastão", "novo chat" ou "salva isso".
---

# Encerrar sessão (síntese para o cérebro e passagem)

## 1. Gravar no cérebro
1. Crie `cerebro/diario/AAAA-MM-DD-assunto-curto.md` a partir de `cerebro/diario/_modelo.md`.
   Síntese, não transcrição: o que foi pedido, o que foi feito, o que foi decidido e por
   quê, o que ficou pendente, o que deu errado. No máximo uma página.
2. Atualize `cerebro/00-estado-atual.md`: fase, o que está pronto, próxima tarefa, e uma
   linha no histórico de sessões.
3. Atualize `cerebro/para-voce-fazer.md`: acrescente os 👉 novos, marque os concluídos.
4. Fato novo sobre a empresa (marca, cardápio, contas, equipamentos, pessoas, regras da
   casa) vai para o arquivo certo em `cerebro/empresa/`. Decisão técnica vai para
   `docs/decisoes/`. Ideia do cliente vai para `cerebro/ideias-do-cliente.md`.
5. Nunca grave segredo, senha, token ou dado pessoal de cliente no cérebro.
6. Faça commit, abra PR só com `cerebro/` e `docs/` e junte na `main` (permitido sem
   perguntar). Sem isso o próximo chat não enxerga nada. Confirme que o merge aconteceu.

## 2. Modo compactar (aviso automático de contexto) ou novo chat
**Modo compactar** (padrão no aviso de contexto, decisão 0009): depois do passo 1, termine
com a linha `👉 Envie /compact para eu continuar neste mesmo chat.` e não gere o bloco abaixo.

**Novo chat** (só quando o responsável pedir ou o assunto terminar): termine a resposta com exatamente este formato, dentro de um bloco de código, para o
responsável copiar com um clique:

```
📋 COPIE E COLE EM UM NOVO CHAT

Continue o projeto ERP. Assunto desta sessão: <assunto>.
Leia cerebro/00-estado-atual.md e cerebro/diario/<arquivo de hoje>.
Onde paramos: <2 a 4 linhas>.
Próximo passo: <uma ação concreta>.
Branch em andamento: <nome ou "nenhuma">. PR aberto: <número ou "nenhum">.
Aguardando do responsável: <itens 👉 que travam, ou "nada">.
```

O bloco é curto de propósito: o detalhe está no cérebro. Se o merge do cérebro falhou,
diga isso antes do bloco e inclua nele a branch onde a síntese ficou.

## 3. Fechar
Depois do bloco, a seção `👉 Para você fazer`.
