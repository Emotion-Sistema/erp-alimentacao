# Frentes paralelas (outros chats ao mesmo tempo)

Pedido do responsável em 15/11/2026: poder abrir **outro chat**, com outro modelo (ex.: Fable),
só para uma função nova, conversando com o chat principal **pelo cérebro**.

## Como funciona
- **Chat principal:** segue o roteiro (`docs/03-roteiro-de-fases.md`, E07, E08...). É o único
  que mexe em `cerebro/00-estado-atual.md` e `cerebro/para-voce-fazer.md` (assim os dois chats
  não brigam pelo mesmo arquivo).
- **Chat de frente:** cuida de UMA função. Escreve só no próprio arquivo
  `cerebro/frentes/<nome-da-frente>.md` (o que fez, decidiu, falta) e no `mural.md`.
- **Mural** (`cerebro/frentes/mural.md`): é por onde um chat fala com o outro. Recado novo vai
  no fim, no formato `- 15/11/2026 · De: principal → Para: <frente> · <recado>`. Quem leu e
  resolveu acrescenta ` ✔ <resposta curta>` na mesma linha. O início de todo chat mostra o mural.
- Tudo chega ao outro chat **só depois de juntado na `main`** (PR só de `cerebro/`, juntado na
  hora). Por isso, antes de cada tarefa, o chat roda `git fetch origin main` e relê o mural e o
  arquivo da frente em `origin/main`.

## Regras que continuam valendo para a frente
- Todas as do `CLAUDE.md`: "Publique tudo", 👉 no fim de toda resposta, nunca push direto na
  `main`, nunca ignorar falha, segredos só em cofre.
- **Antes de qualquer código:** a função passa pela skill `nova-ideia-cliente` (registro em
  `cerebro/ideias-do-cliente.md`, com o encaixe no roteiro). Se ela depender de uma etapa que
  ainda não existe (ex.: pedido, E11+), a frente avisa no mural e espera, em vez de construir
  por cima do que não existe.
- Branches da frente: `feat/<nome-da-frente>-...`. PRs pequenos, um assunto cada.
- Migração de banco: numeração nova pode colidir com a do chat principal. Antes de criar uma,
  a frente pede o número no mural (ex.: "preciso de uma migração") e o principal responde.
- O modelo da frente é o que o responsável escolher. Trabalho crítico (dinheiro, estoque,
  permissão, segurança, migração) continua passando pelo subagente `revisor` antes do merge.
- Ao encerrar: skill `encerrar-sessao`, gravando em `cerebro/frentes/<nome>.md` (não no
  `00-estado-atual.md`); o principal resume a frente no estado atual quando ler o mural.

## Frentes abertas
| Frente | Arquivo | Aberta em | Situação |
|---|---|---|---|
| (nenhuma ainda) | | | |

## Bloco para abrir uma frente (o responsável cola no chat novo)
Antes de colar, escolha o modelo no chat novo (seletor de modelo, ou `/model`). Troque o que
está entre `< >`.

```
Este chat é uma FRENTE PARALELA do projeto ERP, só para a função: <descreva a função em 1 a 3 linhas>.
Nome da frente: <nome-curto-sem-espaço, ex.: cardapio-digital>.
1. Leia CLAUDE.md, cerebro/00-estado-atual.md, cerebro/frentes/README.md e cerebro/frentes/mural.md.
2. Siga as regras de frente do README: escreva só em cerebro/frentes/<nome>.md e no mural; não mexa
   em cerebro/00-estado-atual.md nem em cerebro/para-voce-fazer.md.
3. Primeiro registre a função com a skill nova-ideia-cliente e me diga onde ela encaixa no roteiro
   e do que depende. Não escreva código antes do meu "ok".
4. Crie cerebro/frentes/<nome>.md, ponha a frente na tabela "Frentes abertas" do README, deixe um
   recado no mural para o chat principal e junte isso na main por PR só de cerebro/.
5. Antes de cada tarefa: git fetch origin main e releia o mural.
```
