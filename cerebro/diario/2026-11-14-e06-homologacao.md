# 2026-11-14: E06, homologação na VPS

- Assunto da sessão: E06 (servidor de testes e publicação automática da `main`)
- Branch / PR: `feat/e06-homologacao` (PR da E06)

## O que foi pedido
"pode ir para próxima etapa 06". Critério: o responsável abre o endereço de testes e entra
com o próprio login.

## O que foi feito (decisão 0014)
- O servidor puxa a branch `homologacao` com uma chave só de leitura. O GitHub avança essa
  branch quando o CI da `main` passa, e nenhuma senha do servidor fica no GitHub. A cada
  minuto o servidor procura versão nova e então:
  - monta a imagem;
  - copia o banco;
  - aplica as migrações;
  - troca a versão;
  - confere a saúde.

  Se algo falhar, volta sozinho para a versão anterior.
- HTTPS pelo Caddy em `gestao.187-53-114-38.sslip.io`.
- Papéis do banco separados: o `erp_app` não apaga, não cria tabela e não vê as migrações.
- Primeiro acesso do dono pelo terminal, só com o banco vazio.
- Ensaio em Docker no CI (`infra/homologacao/ensaio-local.sh`).
- Defeitos que o ensaio achou:
  - atrás do proxy, o login era recusado como "outra origem" (agora a trava compara com o Host);
  - o worker tentava criar o próprio esquema (agora o esquema já vem criado).
- Revisão: aprovado com ressalvas, todas tratadas:
  - o servidor só implanta commit que está na `main` e que vem depois da versão no ar;
  - o disparo manual foi retirado;
  - cookies com prefixo `__Host-`, porque o sslip.io não é sufixo público;
  - e-mail opcional para o certificado HTTPS;
  - a linha de início avisa quando a versão ainda não foi marcada;
  - cópias do banco legíveis só pelo root;
  - atualização automática ligada antes da primeira montagem;
  - firewall com a porta real do SSH;
  - o primeiro acesso confere cada resposta na hora.
- Tropeço: o responsável colou o bloco antigo, de várias linhas, antes da hora. O terminal do
  navegador da Hostinger acrescenta `^[[200~` e `~` ao texto colado, e o bloco ficou parado
  esperando. Nada mudou no servidor. O início agora é uma linha só, em base64, testada com
  esses sinais.
- Testes: 175 de sistema e 64 de tela passando. Os dois ensaios também passaram:
  - o ensaio completo;
  - o do atualizador, com v1, sem mudança, v2, v3 quebrada e commit fora da `main`.

## Pendências
- Critério de aceite: o responsável cola a linha, cadastra a deploy key, cria o login e entra.
  Depois disso, criar `infra/homologacao/endereco` para o fluxo conferir o servidor.
- Se o certificado não sair no sslip.io, usar o domínio (pergunta 56).
- Rodar a matriz da API com um papel igual ao `erp_app`.
- Mais adiante:
  - SSH só por chave;
  - limite de requisições (Portão 3);
  - Web Push;
  - backup fora do servidor (E23);
  - teste em Android real.
