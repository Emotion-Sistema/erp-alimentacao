# Homologação: como preparar o servidor (uma vez só)

O servidor de testes é a VPS da Hostinger (IP 187.53.114.38). Depois deste preparo, cada
mudança aprovada na `main` aparece sozinha no endereço de testes, em 5 a 15 minutos.
Desenho e motivos: `docs/decisoes/0014-homologacao-na-vps.md`.

## 👉 Passo a passo do responsável
1. Abra o painel da Hostinger → **VPS** → seu servidor → **Terminal do navegador**
   (ou "Browser terminal"). Entre como `root`, se ele pedir.
2. Copie **todo** o conteúdo de `infra/homologacao/colar-no-terminal.txt` (o Claude manda
   no chat) e cole no terminal. Aperte Enter.
3. O terminal mostra uma linha que começa com `ssh-ed25519`. Ela **não é segredo**.
   Copie essa linha inteira.
4. No GitHub, abra o repositório → **Settings** → **Deploy keys** → **Add deploy key**.
   - Title: `homologacao`
   - Key: cole a linha
   - **NÃO** marque "Allow write access"
   - Clique em **Add key**
5. Volte ao terminal e aperte Enter. A primeira montagem leva de 5 a 15 minutos.
6. No fim, o terminal pergunta o nome da empresa, da loja, o seu nome, o seu login e a sua
   senha. A senha não aparece na tela enquanto você digita.
7. Abra `https://gestao.187-53-114-38.sslip.io` e entre com o seu login. No primeiro acesso,
   configure o código no aplicativo autenticador do celular (Google Authenticator,
   Microsoft Authenticator ou outro).
8. Avise o Claude no chat: "homologação pronta" (ou mande o que apareceu, se deu erro).

## Comandos no servidor (se o Claude pedir)
| Comando | Para quê |
|---|---|
| `erp situacao` | Versão no ar e o que está rodando |
| `erp registros` | Últimas mensagens da atualização e dos aplicativos |
| `erp atualizar` | Buscar a versão nova agora, sem esperar o minuto |
| `erp atualizar --de-novo` | Tentar de novo uma versão que tinha falhado |

## O que fica no servidor
`/opt/erp/codigo` (código), `/opt/erp/segredos` (senhas do banco e chave do segundo fator,
geradas lá, só root), `/opt/erp/copias` (cópia do banco antes de cada atualização, as 10
últimas), `/opt/erp/estado` (versão no ar).
