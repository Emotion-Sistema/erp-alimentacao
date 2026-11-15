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

## Fechamento (15/11/2026)
- **Primeiro bloco colado não rodou.** O responsável colou o bloco de várias linhas antes da hora. Nada mudou no servidor; o início virou uma linha só (PR #15).
- **A linha única parou depois de instalar o Docker, sem mensagem.** O `sshd -T` falha com o SSH em espera, e o `set -e` com `pipefail` encerrou o script calado.
  - Corrigido no PR #16: a porta do SSH passa a ser 22 se não der para ler, e qualquer erro avisa a linha onde parou.
  - Colada de novo, a linha usa a versão marcada mais nova.
- **O responsável pediu para mudar os nomes depois.** Perguntou se o nome da empresa, da loja e o dele podem ser mudados, e se precisa ser o nome do CNPJ. Respondi:
  - nomes de teste servem;
  - ainda não há tela para mudar; eu altero se precisar, e a tela de dados da empresa e do CNPJ vem na E20;
  - na produção tudo é criado de novo.
- **"homologação pronta":** o responsável preparou o servidor e criou o login. Conferido daqui:
  - `/api/saude` responde por HTTPS com certificado válido;
  - a versão no ar é 76cf3d3.
- **Conferência automática ligada:** criado `infra/homologacao/endereco`, e o fluxo do GitHub passa a esperar a versão no ar.

## Pendências
- Se o certificado não sair no sslip.io, usar o domínio (pergunta 56).
- Rodar a matriz da API com um papel igual ao `erp_app`.
- Mais adiante:
  - SSH só por chave;
  - limite de requisições (Portão 3);
  - Web Push;
  - backup fora do servidor (E23);
  - teste em Android real.

## 15/11/2026: SSH só por chave
Responsável criou a chave (ed25519, com frase-senha) e entrou com ela. `ssh-so-chave.sh` roda a cada minuto pelo atualizador e desliga a senha só se o root tiver chave; volta com `erp ssh-senha ligar`. Ensaiado num contêiner com sshd: sem chave não mexe, com chave desliga, idempotente, ligar/desligar, config quebrada não fica gravada. Falta o responsável conferir o terminal do navegador.
