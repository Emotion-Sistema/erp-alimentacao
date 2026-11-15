# 0014: homologação na VPS, publicação automática da main

- Data: 14/11/2026
- Status: aceita (E06); servidor preparado e no ar em 15/11/2026
- Assunto da sessão: E06, homologação
- Complementa: decisões 0003 (arquitetura), 0004 (regras de operação) e 0010 (papéis do banco)

## Contexto
A VPS de testes (Hostinger KVM 2, Ubuntu 26.04, IP 187.53.114.38) foi contratada sem
configuração. A sessão do Claude não alcança o servidor e não pode ver credencial nenhuma. O
responsável não é programador: o preparo precisa ser um passo só, sem ferramenta no
computador dele.

## Decisão
1. **Preparo em um passo.** O responsável cola uma única linha (`infra/homologacao/colar-no-terminal.txt`,
   que é o `inicio.sh` em base64) no terminal do navegador do painel da Hostinger. É uma
   linha só porque esse terminal acrescenta sinais ao texto colado (`^[[200~` no começo e
   `~` no fim) e estragou o primeiro bloco de várias linhas, em 14/11/2026. O CI confere
   que a linha é igual ao `inicio.sh`. O bloco gera no servidor uma chave
   **só de leitura** do repositório e mostra a parte pública. O responsável cola essa parte
   no GitHub (Settings → Deploy keys, sem permissão de escrita). Depois o servidor baixa o
   código e roda `preparar-servidor.sh`, que faz o resto:
   - atualizações do sistema e atualizações de segurança automáticas;
   - Docker;
   - firewall (só 22, 80 e 443);
   - fail2ban no SSH;
   - segredos;
   - atualização automática;
   - primeira montagem;
   - login do dono.
2. **Publicação automática da `main`, puxada pelo servidor.** Quando o CI de um push na
   `main` passa, o GitHub Actions avança a branch `homologacao` até aquele commit. O avanço
   é feito sem forçar e só para a frente. O servidor confere essa branch a cada minuto
   (systemd) e faz o seguinte:
   - monta a imagem;
   - copia o banco (guarda as 10 últimas cópias);
   - aplica as migrações;
   - troca a versão;
   - confere a saúde (a gestão responde com o commit novo; loja, site e worker de pé).

   O servidor só implanta um commit que **está na `main` e vem depois da versão no ar**
   (recusa voltar no tempo e commit de fora da `main`). Se algo falhar, volta para a versão
   anterior e não tenta mais aquela versão. Uma falha
   de rede na montagem ganha até 3 tentativas. Depois o Actions espera `/api/saude` mostrar
   o commit novo (ou uma versão mais nova que já o inclua): se não mostrar em 30 min, o
   fluxo falha e o GitHub avisa. Não há disparo manual: só commit com CI verde é marcado.

   **Nenhuma senha ou chave do servidor fica no GitHub**, e o Claude não vê nenhuma.
   Migração não é desfeita na volta (as migrações são só de adicionar; skill
   `migracao-segura`): para isso existe a cópia feita antes.
3. **Endereço sem domínio:** `https://gestao.187-53-114-38.sslip.io` (também `loja.` e
   `site.`). O sslip.io devolve o IP escrito no nome, então funciona sem comprar domínio, e
   o Caddy tira o certificado HTTPS sozinho (Let's Encrypt, com ZeroSSL de reserva). Quando
   houver domínio (pergunta 56 do questionário), troca-se `ERP_DOMINIO` no servidor. Todo
   o ambiente responde `X-Robots-Tag: noindex` para não aparecer em buscador.
   O sslip.io **não está na lista de sufixos públicos**, então qualquer `*.sslip.io` conta
   como "o mesmo site". Por isso os cookies de sessão e da estação usam o prefixo
   `__Host-` em produção e homologação: o navegador não deixa outro endereço gravar um
   cookie com esse nome. Pelo mesmo motivo o limite de certificados do Let's Encrypt é
   dividido com todo o mundo que usa sslip.io. O preparo pede um e-mail opcional para o
   certificado, que liga a reserva pela ZeroSSL. Se mesmo assim não sair certificado, o
   plano B é o domínio (pergunta 56).
4. **Papéis separados do PostgreSQL** (pendência da 0010), criados a cada implantação por
   `packages/banco/src/papeis.ts`:
   - `erp_dono` é o dono do esquema e só as migrações o usam;
   - `erp_app` (telas e API) lê, grava e altera, mas **não apaga linha, não esvazia
     tabela, não muda o esquema e não vê o controle de migrações**. É o RC-17 garantido
     também no banco;
   - `erp_worker` tem o mesmo do `erp_app`, mais o esquema `fila` (pg-boss), que é dele.

   O banco não tem porta aberta: só o Caddy publica portas.
5. **Segredos gerados no próprio servidor** (`/opt/erp/segredos/erp.env`, só root, permissão 600):
   - as senhas dos 4 papéis do banco;
   - `ERP_CHAVE_SEGREDOS` (chave que cifra o segundo fator).

   Nunca saem da máquina e nunca são trocados por um novo preparo, porque trocar a chave
   apagaria o segundo fator de todo mundo. Isso atende "segredos só em cofre": nada vai ao
   Git, a log, a docs, ao cérebro ou ao ambiente da nuvem.
6. **Login do dono no primeiro acesso** (`prepararPrimeiroAcesso`, `erp primeiro-acesso`):
   - o servidor pergunta no terminal o nome da empresa, da loja, o nome e o login do dono, e a
     senha sem mostrar na tela;
   - só funciona com o banco **vazio de pessoas**, uma vez (trava contra dois ao mesmo tempo);
   - cria os turnos (08h-15h30, 15h30-23h30) e os setores, e fica na auditoria.

   As outras pessoas são cadastradas pela tela Funcionários, com permissão e auditoria. Na
   homologação **não há dados fictícios nem a senha de teste** (o endereço é público).
7. **Imagem única** (`infra/homologacao/Dockerfile`) para gestão, loja, site, worker e
   migrações. Na homologação ela é montada no próprio servidor. A regra "não compilar no
   servidor de atendimento" vale para a produção (E23), onde a imagem virá pronta do GitHub.
8. **Ensaio em todo PR:** o CI roda `infra/homologacao/ensaio-local.sh`. Ele usa a mesma
   imagem, compose e Caddy, com domínio `localhost`, e confere:
   - migrações duas vezes;
   - o que o `erp_app` não pode fazer;
   - o primeiro acesso;
   - HTTPS e cabeçalhos;
   - loja e site;
   - HTTP indo para HTTPS;
   - login pelo proxy (cookie `Secure`, segundo fator pedido, outra origem recusada, IP
     registrado);
   - o worker com a fila.

## Comandos no servidor
`erp situacao` (versão no ar e contêineres), `erp registros`, `erp atualizar [--de-novo]`,
`erp primeiro-acesso`.

## Limites conhecidos
- Quem tem escrita no repositório pode pôr código na `main` e, portanto, no servidor (que
  roda como root). No plano gratuito do GitHub não há proteção de branch em repositório
  privado (decisão 0009): a barreira é a trava do repositório e o CI. Rever antes da E23.
- O ensaio exercita o papel `erp_app` no login e no primeiro acesso; a suíte de testes roda
  como superusuário. Um `DELETE` novo no domínio passaria no CI e só falharia na
  homologação (a volta automática segura). Pendente: rodar a matriz da API com um papel
  igual ao `erp_app`.

## SSH só por chave (15/11/2026)
O responsável cadastrou a chave dele no painel e entrou com ela. Desde então o atualizador
roda `ssh-so-chave.sh` a cada minuto: se o root tem chave cadastrada, confere antes com
`sshd -t` e só então grava `/etc/ssh/sshd_config.d/00-erp-so-chave.conf` (sem senha, root
só com chave) e confirma com `sshd -T -C user=root,...`. Se a chave sumir, a senha volta
sozinha. Escreve no registro só quando a situação muda.
Para voltar a aceitar senha: `erp ssh-senha ligar` (e `desligar` para refazer).
Conferido pelo responsável em 15/11/2026, já no ar: a senha é recusada no SSH e o terminal do
navegador da Hostinger continua abrindo (é o acesso de emergência se a chave se perder).

## Fica para depois (com etapa)
- **Limite de requisições** no login e nas rotas públicas: o login já bloqueia por
  tentativas (E03); o limite por IP entra antes do site e do delivery públicos (Portão 3).
- **Web Push** (chaves VAPID no servidor): com os avisos com aplicativo fechado (0013).
- **Backup fora do servidor e ensaio de restauração:** homologação só tem dados de teste;
  obrigatório antes da produção (E23, skill `ensaio-restauracao`).
- **Instalar o atalho num Android real:** roteiro 👉 da E06.

## Alternativas descartadas
- GitHub Actions entrando no servidor por SSH: exigiria guardar no GitHub uma chave com
  acesso ao servidor e o responsável copiar uma chave privada do terminal. Puxar com chave
  só de leitura é mais simples e mais seguro.
- Imagem num registro (GHCR): exigiria um token de leitura no servidor. Fica para a produção.
- Domínio grátis da Hostinger: depende da resposta do dono (pergunta 56).


## Critério de aceite e evidência
👉 O responsável abre `https://gestao.187-53-114-38.sslip.io` e entra com o próprio login
(e configura o segundo fator). Evidência automática: o job "Ensaio da homologação" no CI e o
fluxo "Implantar (homologacao)" esperando o servidor mostrar o commit em `/api/saude`.
