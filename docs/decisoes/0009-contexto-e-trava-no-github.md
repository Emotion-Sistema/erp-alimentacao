# 0009: aviso de contexto a cada 10% e trava também nas ferramentas do GitHub

- Data: 14/11/2026
- Status: aceita (respostas do responsável à conferência da T01). Ajusta os itens 1 e 4 da 0004.
- Assunto da sessão: T01, conferência

## Contexto
A conferência da T01 achou: (a) o aviso de contexto usava limite de 200 mil, mas a janela
real das sessões é de 1 milhão; (b) a trava de publicação só olhava os comandos git e a
Hostinger: as ferramentas do GitHub conseguiam gravar ou abrir PR na `producao` sem a
frase, e um push para `refs/heads/main` passava; (c) a proteção de branch do GitHub
(rulesets) não é aplicada em repositório privado de organização no plano gratuito.

## Decisão
1. Limite do aviso de contexto: 1.000.000 (`ERP_CONTEXTO_MAX`). Aviso a cada 10% de uso.
   No aviso: atualizar o cérebro e pedir ao responsável `/compact`, continuando no mesmo
   chat. Novo chat só quando ele pedir.
2. A trava bloqueia, sem "Publique tudo", qualquer ferramenta do GitHub que cite a branch
   `producao` (gravar arquivo, criar branch, criar ou mudar PR com base `producao`), e
   push com `refs/heads/main` ou `refs/heads/producao`.
3. Enquanto o repositório estiver no plano gratuito, a trava do repositório é a única
   barreira automática. A proteção no GitHub fica para quando houver plano que a aplique.

## Limites conhecidos
Juntar um PR que já tenha base `producao` não é detectável pela trava (só recebe o
número do PR); por isso a criação desse PR é que é bloqueada.

## Critério de aceite e evidência
Simulações do hook registradas no PR desta decisão.
