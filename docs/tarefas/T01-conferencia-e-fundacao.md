# T01: conferência do plano e início da fundação

Primeira tarefa do projeto: etapas E01 e E02 da ordem de construção
(`docs/03-roteiro-de-fases.md`). Antes de começar, mostre o plano de modelos
(`docs/05-uso-dos-modelos.md`) e confirme que a sessão está em Opus.

## Parte 1: conferência (sem escrever código)
1. Leia `CLAUDE.md`, todo o `docs/` e todo o `cerebro/`.
1a. Confira as travas (decisão 0004): o estado do cérebro apareceu no início? Tente um
    `git push origin HEAD:producao` sem a frase: deve ser bloqueado. Relate o resultado.
2. Rode `check-tools` e registre versões de Node, PostgreSQL e Docker disponíveis.
3. Responda ao responsável, em linguagem simples e em até 25 linhas:
   - o que você entendeu que será construído (5 linhas);
   - onde você **discorda** do plano ou vê risco, com a alternativa (não concorde por padrão);
   - o que consegue fazer sozinho, o que depende do responsável e o que depende do cliente;
   - no máximo 5 perguntas, cada uma com a decisão que ela muda.
4. Se discordar de uma decisão em `decisoes/`, proponha novo registro; não altere o antigo.

Não espere respostas para seguir: avance com as hipóteses de `04-pendencias.md`.

## Parte 2: fundação (etapa E02), em branch `feat/fundacao`
1. Escolha as bibliotecas previstas na decisão 0003, conferindo versão e manutenção
   atuais, e registre em novo arquivo de `decisoes/` (próximo número livre).
2. Monte o monorepositório: `apps/gestao`, `apps/loja`, `apps/site` (as duas últimas só
   com a casca e uma página), `apps/worker`, pacote de domínio, pacote de banco, pacote de interface.
3. Banco: migrações versionadas; tabelas de empresa, unidade, setor, usuário, perfil e auditoria.
4. Autenticação e permissões verificadas no servidor, com teste que prova o bloqueio de
   usuário sem alçada chamando a API diretamente.
5. Base visual mínima por variáveis de tema (identidade ainda não recebida) e uma tela de entrada.
6. Ambiente de desenvolvimento que sobe com um comando (PostgreSQL da sessão ou Docker).
7. CI no GitHub Actions: lint, tipos, testes com PostgreSQL real. Deixe prontos, sem
   ativar, os fluxos de implantação: `main` -> homologação e `producao` -> produção.
8. Preencha a seção "Comandos" do `CLAUDE.md`.
9. Abra o PR com a skill `checklist-pr` e encerre com a skill `encerrar-sessao`.

## Fora desta tarefa
Estoque, pedidos, caixa, fiscal, delivery, conteúdo do site, mídia. Cada um tem sua fase.

## Pronto quando
PR aberto, CI verde, e o responsável consegue seguir os passos "como conferir" do PR.
