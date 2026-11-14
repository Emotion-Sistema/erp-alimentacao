# 2026-11-13: preparação do projeto

- Assunto da sessão: organização e planejamento (feito no chat do Claude, antes do Claude Code)
- Branch / PR: primeiro PR do repositório

## O que foi pedido
Organizar o projeto para ser tocado inteiro no Claude Code pelo navegador, com um assunto
por chat, memória compartilhada e o máximo de automação.

## O que foi feito
Criados `CLAUDE.md`, requisitos (RC-01 a RC-04 e RC-06 a RC-18), decisões 0001 a 0008,
cérebro, sete skills e três travas automáticas (início de sessão, aviso de contexto e
bloqueio de publicação).

## O que foi decidido (e por quê)
- Refazer o desenho técnico em vez de seguir o planejamento anterior (0003).
- Nada vai ao ar sem "Publique tudo"; produção é a branch `producao` (0004).
- Escopo passa a incluir site institucional e delivery próprio com app do cliente (0005).
- Estoque em dois níveis, em uso e guardado, com disponibilidade automática para venda,
  linhas saudável e de emergência e notificações ao responsável (0006, RC-09).
- Cozinha no andar de baixo com quatro tablets por tipo de pedido, cafeteria com tela
  própria, botão de fila, temporizador, estimativa de tempo e avisos (RC-10, 0007).
- Sorveteria 60 Sabores fora do sistema; só leitura de dados. Integração com o sistema
  da franquia não confirmada: nada encontrado publicamente sobre "Mollbyte" (RC-11).
- Aparelhos internos só Android, da empresa; um login por funcionário.
- Cargos definidos; estoque por área; compras com o gerente geral; aba de potes de
  sorvete; atendente marca Entregue e só o caixa marca Pago; caixa, motoboy, financeiro,
  calculadoras, histórico e comunicação viraram requisitos (0008, RC-12 a RC-18).
- Construção por partes, em 36 etapas com portões de teste (`docs/03-roteiro-de-fases.md`).
- Base Opus 5.5; Sonnet e Haiku para o que não precisa dele, via subagentes; o Claude
  avisa o plano de modelos antes de cada tarefa (`docs/05-uso-dos-modelos.md`).
- Questionário em PDF entregue ao responsável para levar ao dono da empresa.
- Uso do guardado gera mensagem urgente ao responsável pelas compras.
- Assuntos comerciais ficam fora do repositório.

## O que ficou pendente
Tudo de `cerebro/para-voce-fazer.md`. Identidade visual será enviada depois.

## O que deu errado ou surpreendeu
As travas foram testadas fora do Claude Code. Falta confirmar na primeira sessão real que
o aviso de contexto dispara e que as skills aparecem.

## 👉 Ficou para o responsável
Ver `cerebro/para-voce-fazer.md`, seção "Agora".

## Skills usadas / skill que valeria criar
Ver `cerebro/automacoes.md`.
