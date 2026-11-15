# Mod "Salão" do Claude

Ferramenta de trabalho do responsável. **Não faz parte do ERP** e nunca vai para o ar com ele.

Mostra o que o Claude está fazendo como um restaurante em funcionamento:

- **Faixa acima da caixa de mensagem:** movimento do salão e se há algo em segundo plano.
- **Painel "Salão":** sala isométrica desenhada (SVG) com um profissional por tipo de
  trabalho, e a lista do que cada um faz. No terminal, que não desenha SVG, fica só a lista.
- **Fogo baixo:** cada processo em segundo plano é uma panela acesa. Fogão apagado =
  nada em segundo plano.

| Trabalho | Profissional |
|---|---|
| Ler e procurar | Garçom |
| Criar e editar arquivos | Cozinheiro |
| Rodar comandos e testes | Chapeiro |
| Internet e conectores | Entregador |
| Git, GitHub, PR | Caixa |
| Subagente `ajudante` / `construtor` / `revisor` / outros | Auxiliar / Coz. de linha / Chef / Reforço |

Níveis: casa vazia, movimento leve (1), casa cheia (2 a 3), rush (4 ou mais, ou equipe de subagente).

## Como o segundo plano é conferido
- Comando lançado em segundo plano entra na hora (o resultado da ferramenta traz o id).
- Subagentes vêm da lista do motor, relida a cada 2 segundos.
- Ao fim de cada resposta o motor informa o que continua aberto (`classic.Stop`): essa
  lista substitui a do painel. Limite conhecido: um comando que termina no meio de uma
  resposta só sai do fogo quando a resposta acaba.

## Onde aparece
- Aplicativo que desenha painéis de mod: faixa e painel "Salão" dentro do próprio aplicativo.
- Sessão na nuvem em que o aplicativo não desenha painéis (o `/salao` responde
  "no-surface"): o mod escreve a cena em `/tmp/salao-web/` (`index.html` + `cena.json`) e a
  página é servida com `python3 -m http.server 4747 --bind 127.0.0.1 --directory /tmp/salao-web`
  (o Claude sobe em segundo plano e informa a porta 4747 à pré-visualização do aplicativo).

## Arquivos
`hooks/cena.ts` (lógica e desenho, sem acesso ao motor), `hooks/register.tsx` (ganchos), `hooks/pagina.ts` (página do navegador),
`types/index.d.ts` (contrato do estado), `hooks/salao.test.tsx` (testes), `previa-rush.svg`
(amostra do desenho).

## Usar em uma sessão
Peça ao Claude: "ligue o mod Salão de `ferramentas/mod-salao`" (ele usa a skill
`plugin-authoring`, copia a pasta para a área de mods da sessão e valida com
`claude plugin validate` e `claude plugin test`). O comando `/salao` reabre o painel.
