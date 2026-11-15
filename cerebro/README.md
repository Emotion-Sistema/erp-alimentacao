# Cérebro do projeto

A memória única do projeto e da empresa. Cada chat do Claude Code começa do zero; é aqui
que um chat descobre o que os outros fizeram. Regra: **se não está no cérebro, não aconteceu.**

## Estrutura
| Onde | O que guarda |
|---|---|
| `00-estado-atual.md` | Em que pé está o projeto, próxima tarefa, histórico de sessões. Lido no início de todo chat |
| `para-voce-fazer.md` | Lista viva dos itens 👉 do responsável |
| `diario/` | Uma síntese por sessão (o que foi feito, decidido e deixado pendente) |
| `empresa/` | Tudo sobre a empresa: perfil, operação, identidade visual, presença digital, contas e serviços |
| `ideias-do-cliente.md` | Ideias e pedidos, classificados antes de virar trabalho |
| `frentes/` | Outros chats ao mesmo tempo, cada um numa função: arquivo por frente e o `mural.md`, por onde os chats trocam recados |
| `automacoes.md` | Skills existentes e recomendadas, subagentes e modelos, conectores e plugins |

Requisitos e decisões técnicas ficam em `docs/` (o cérebro aponta para eles, não os copia).

## Regras de escrita
1. Síntese, não transcrição. Uma sessão = no máximo uma página.
2. Cada informação em um lugar só. Se mudou, corrija no lugar; não crie uma segunda versão.
3. Fato tem data e origem ("13/11/2026, dito pelo responsável").
4. Hipótese é marcada como hipótese.
5. Nunca gravar senha, token, certificado, dado de cartão ou dado pessoal de cliente.
   Em `empresa/contas-e-servicos.md` registra-se QUE a conta existe e quem é o dono,
   nunca a credencial.
6. Atualização do cérebro vai por PR só de `cerebro/` e `docs/`, juntado na `main` na
   hora, para os outros chats enxergarem.

## Limite conhecido
Dois chats abertos ao mesmo tempo só enxergam o que o outro já juntou na `main`. Por isso
cada chat grava o cérebro ao encerrar (skill `encerrar-sessao`), e convém não manter
vários chats mexendo no mesmo assunto. Para trabalhar em paralelo numa função separada, use
as frentes (`frentes/README.md`).
