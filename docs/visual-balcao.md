# Visual Balcão: a identidade de toda tela da gestão

Pedido do responsável (25/11/2026): "o que você me apresentou vira a identidade da marca para todas
as abas que forem criadas", "quero exatamente igual ao protótipo". Decisão 0028.

**Referência única:** protótipo A, `cerebro/frentes/visual-limpo/prototipos.html`. Na dúvida, abra o
protótipo e copie. Se a tela nova não existe no protótipo, siga as peças abaixo; nunca invente outro
estilo.

## Onde está
- `apps/gestao/app/balcao.css`: o acabamento de tudo (botões, campos, cartões, listas, selos, abas,
  tabelas, avisos, janela em gaveta, barra de ferramentas). Vale sozinho para toda tela dentro da casca.
- `apps/gestao/app/Casca.tsx`, `Menu.tsx` (trilho), `TopoDaTela.tsx` (topo), `BarraDeBaixo.tsx` (celular).
- `packages/interface/src/tema.css`: cores e tokens (`--cor-linha`, `--cor-brasa-suave`).

## Como é uma tela (igual ao protótipo)
1. **Trilho de ícones** à esquerda (computador/tablet) e **barra de baixo** no celular: vêm da casca.
   A tela nunca monta menu próprio. Item novo de menu entra no catálogo (`aplicativos.ts`) com ícone.
2. **Topo**: nome da tela, "aplicativo · pessoa" e o cargo em pílula; relógio, sino e conta. Vem da
   casca. O `h1` da página com o mesmo nome da tela fica só para o leitor de tela (não repete).
3. **Logo abaixo**: uma frase curta que explica a tela (`<p className="hor-tela__intro">`).
4. **Barra de ferramentas** numa linha: filtros em chips (`balcao-chips` / `balcao-chip` com
   `aria-pressed`) à esquerda; busca (`balcao-busca`) e botões (secundário, depois o principal) à direita
   (`balcao-acoes`), dentro de `balcao-barra`.
5. **Lista num cartão só** (`balcao-lista`) com cabeçalho de colunas em versalete
   (`balcao-lista__cab`); grupos (ex.: categoria) viram subtítulo em versalete dentro do mesmo cartão;
   cada item é uma linha (`hor-cat`) separada por linha fina, ações discretas à direita.
6. **Cadastro e detalhe** abrem numa **gaveta à direita** (`<dialog className="janela">`), nunca numa
   página nova nem no meio da tela.
7. **Um botão forte por tela** (o principal, em brasa). Os outros são claros, sem borda grossa.

## Medidas
- Letra: 15 px no texto, 14 px em botão e campo, 12-13 px em apoio, 11-12 px em versalete.
  Título da tela 16 px no topo. Aplicativos de tablet (cozinha) usam a letra maior.
- Cantos: 16 px em cartão, 10 px em botão, 9 px em campo, pílula em chip e selo.
- Linhas: 1 px em `--cor-linha`. Campo com borda de 1 px em `--cor-borda` (contraste 3:1).
- Sombra: só a `--sombra-cartao` (contorno fino + sombra curta). Nada de sombra forte.
- Alvos: 44 px no computador, 48 px em tela de toque (`--alvo-controle`).

## Claro, escuro e letra grande (decisão 0030)
Cada pessoa escolhe (sol/lua no topo; "Letra grande" no menu da conta). A tela não faz nada: use só
as variáveis do tema e medidas em rem, e ela funciona nos dois temas e nas duas letras.

## Proibido (era o que deixava a tela "poluída")
- Borda de 2 px em botão, campo ou cartão; cartão dentro de cartão; faixa escura no topo.
- Letra grande no conteúdo (título de página acima de 22 px, texto acima de 15 px).
- Cor escrita fora de `tema.css` (o teste `sem-cor-fixa` falha). Laranja/âmbar da logo como letra.
- Menu, topo ou layout próprio numa tela.

## Como conferir antes do PR
1. `pnpm teste:tela cascas.spec.ts` tira foto de cada tela em celular, tablet e computador
   (`apps/gestao/test-results/telas`).
2. Compare com a main: `pnpm exec tsx scripts/comparar-telas.ts <antes> <depois> <saida.html>` e ponha
   a página no PR. Compare também com o protótipo.
3. Skill `tela-da-gestao` tem a receita passo a passo.
