# 0003: arquitetura base

- Data: 13/11/2026
- Status: aceita (decisão técnica delegada pelo responsável; revisável com novo registro)
- Assunto da sessão: arquitetura

## Contexto
O planejamento anterior deixava várias escolhas em aberto e tratava tudo como proposta
a revisar. O responsável autorizou refazer o que for preciso. O sistema atende uma
unidade, com 5 a 15 dispositivos, mantido por uma pessoa com apoio do Claude Code.
Simplicidade de operação pesa mais que flexibilidade.

## Decisão
1. **Um só código TypeScript**, monorepositório. Aplicações web em Next.js (gestão, loja
   e site, ver decisão 0005) e **worker em processo separado**, todos usando o mesmo
   pacote de domínio e o mesmo banco.
2. **PostgreSQL como única dependência de dados.** Fila e outbox dentro do PostgreSQL.
   Sem Redis e sem serviço de mensageria na primeira versão.
3. **SQL explícito nas operações de estoque e dinheiro** (trava por linha e atualização
   condicional). Camada de acesso tipada e migrações em SQL versionado, não geração
   automática de esquema.
4. **Tempo real para a produção por envio do servidor (SSE)**, com busca da fila gravada
   ao conectar e ao reconectar. A fila no banco é a verdade; o aviso é só gatilho.
5. **Autenticação própria**, com código pessoal para troca rápida em aparelho
   compartilhado e senha com segundo fator para administração.
6. **Fiscal e pagamento por provedores**, atrás de uma interface interna, para trocar de
   fornecedor sem reescrever o núcleo. Nunca comunicação direta com a SEFAZ.
7. **Sem offline coordenado na primeira versão.** Contingência é procedimento documentado
   e segundo link de internet.
8. **Backup:** arquivamento contínuo dos logs do PostgreSQL para armazenamento externo,
   mais cópia completa periódica. É o que torna a meta de RPO de 15 minutos alcançável em
   VPS única. Sem isso, a meta honesta é a idade do último backup. RTO de 2 horas só vale
   depois de ensaio cronometrado em outro servidor.
9. **Mídia:** player próprio como página do sistema em aparelho dedicado, para o piloto.

## Bibliotecas
Escolher na etapa E02, conferindo versão e manutenção atuais antes de adotar: fila sobre
PostgreSQL, camada de acesso tipada, validação de entrada, testes (unidade, integração
com PostgreSQL real, navegador). Registrar a escolha em novo registro de decisão.

## Alternativas descartadas
- Microserviços: custo operacional sem benefício nesta escala.
- Redis para fila: mais um serviço para manter e fazer backup, sem necessidade.
- WebSocket: SSE resolve o sentido servidor -> tela com menos estado.
- Plataforma de sinalização paga já no piloto: dependência e licença antes de provar a necessidade.

## Consequências
Um servidor, um banco, dois processos. Fácil de operar e de restaurar. Limite conhecido:
sem alta disponibilidade; queda do servidor para a operação até a recuperação.

## Critério de aceite e evidência
Ambiente sobe com um comando; testes do RC-01 rodam contra PostgreSQL real; restauração
ensaiada e cronometrada antes da entrada em operação.
