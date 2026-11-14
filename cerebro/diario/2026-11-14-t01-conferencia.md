# 2026-11-14: T01 parte 1 (conferência, etapa E01)

- Assunto da sessão: montagem do repositório e conferência do plano (E01)
- Branch / PR: `claude/montar-projeto-pr-main-66i5po`; PR #1 (estrutura) juntado na `main`

## O que foi pedido
Rodar `montar-projeto.sh`, apagar o script, juntar na `main` e executar a T01.

## O que foi feito
- Estrutura montada (68 arquivos) e juntada na `main` pelo PR #1. Script removido.
- Leitura completa de `CLAUDE.md`, `docs/` e `cerebro/`.
- Teste das travas (14/11/2026, Opus 5.5):
  - `git push --dry-run origin HEAD:producao` real, sem a frase: **bloqueado** pelo hook.
  - Simulação do hook: push para `main` e push forçado bloqueados; push de branch de
    trabalho liberado; "Publique tudo" libera só naquela mensagem e a seguinte volta a
    bloquear; ação de escrita da Hostinger bloqueada, leitura liberada.
  - Estado do cérebro no início: **não apareceu nesta sessão**, porque os hooks ainda
    não existiam quando ela abriu. O script funciona quando rodado à mão. Conferir na
    próxima sessão.
- Ferramentas da sessão: Node 22.23.4, npm 10.9.9, pnpm 10.28.0, PostgreSQL 16.15
  (instalado, parado), Docker 29.9.2 com Compose 5.6.1, Chromium/Playwright.

## O que foi decidido (e por quê)
Nada novo decidido. Propostas feitas ao responsável (aguardando resposta):
1. Fechar as brechas da trava (ver abaixo).
2. Autenticação "própria" = sem serviço externo, mas usando bibliotecas mantidas para senha,
   sessão e segundo fator. Será registrada na decisão de bibliotecas (E02).
3. "Só abre em aparelho cadastrado" é um controle fraco num aplicativo web; o forte é
   gestão de aparelhos (evolução).

## Respostas do responsável (mesmo dia)
1. Reforçar a trava: sim (feito; decisão 0009).
2. Contexto: limite 1 milhão, aviso a cada 10%, compactar e seguir no mesmo chat (feito).
3. Autenticação com bibliotecas mantidas: ok.
4. Proteção de branch no GitHub: a tela avisou que rulesets não valem em repositório
   privado no plano gratuito; não foi criada.

## O que ficou pendente
- E02 (fundação) aguarda o "ok" do responsável (regra de etapa nova).

## O que deu errado ou surpreendeu
- **Brechas na trava de publicação:** (a) as ferramentas do GitHub (MCP) podem escrever ou
  juntar PR na `producao` sem a frase, pois o hook só confere a Hostinger; (b) um push com
  `HEAD:refs/heads/main` passa pela regra da `main`. A proteção de branch no GitHub fecha
  as duas.
- O limite do aviso de contexto (`ERP_CONTEXTO_MAX` = 200000) é 1/5 da janela real desta
  sessão (1 milhão): o aviso de "50%" dispara com cerca de 10% de uso real.
- O hook bloqueia qualquer comando que contenha o texto de push forçado, mesmo em teste.

## 👉 Ficou para o responsável
Ver `cerebro/para-voce-fazer.md`.

## Modelos usados
Tudo pelo Opus 5.5 (sessão principal): leitura, teste das travas e análise. Nenhum subagente.

## Skills usadas / skill que valeria criar
Nenhuma skill do repositório foi necessária na E01.
