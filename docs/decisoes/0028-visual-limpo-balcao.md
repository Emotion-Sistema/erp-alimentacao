# 0028: visual limpo da gestão ("Balcão", protótipo A)

- Data: 25/11/2026
- Status: aceita (frente visual-limpo, parte 1)
- Assunto da sessão: novo visual do ERP
- Revê: decisão 0019, item 5 (casca da gestão) e o tamanho de letra da equipe; decisão 0012, "gestão
  sempre clara" (passa a ser escolha de cada pessoa, na parte 4). Mantém tudo o mais da 0012 e da 0019
  (catálogo por cargo, menu que só esconde, paleta, letras, regras de uso da cor).

## Contexto
O responsável achou a gestão poluída: letra grande demais, bordas fortes, faixa escura e abas pesando
na tela (25/11/2026). Viu três protótipos e escolheu o **A, "Balcão"** (artifact "Novo visual do ERP",
versão 11; cópia em `cerebro/frentes/visual-limpo/prototipos.html`). Pediu para manter a identidade.

## Decisão
1. **Casca no computador e no tablet (acima de 640 px):** trilho de ícones à esquerda, claro, com o
   símbolo da marca no alto e cada seção com ícone e nome curto embaixo; a seção aberta fica em brasa
   sobre fundo de brasa suave. O trilho é o `nav` "Menu" e nasce do catálogo do cargo (0012), igual a
   antes. Topo claro e baixo: nome do aplicativo, quem está usando e o cargo, o sino e o botão redondo
   da conta (trocar cargo, tela cheia, minha conta, sair), que abre uma janela pequena.
2. **Celular (até 640 px):** a barra de baixo da 0019 continua igual; o topo fica claro como no
   computador, com o símbolo, o aplicativo, o sino e a conta.
3. **Letra:** texto da equipe em 15 px (antes 18 px), títulos menores. Aplicativos de tablet (cozinha,
   estação) continuam com a letra de antes até a parte 4, quando cada pessoa escolhe normal ou grande.
   Alvos de toque continuam com 48 px ou mais.
4. **Linhas leves:** divisões da casca numa linha fina do tom do café (`--cor-linha`, transparente),
   sem faixa escura. A borda de campo (3:1) não muda.
5. **Fotos antes e depois:** o teste das cascas tira foto de cada tela em 3 tamanhos; o script
   `scripts/comparar-telas.ts` monta uma página com as duas versões lado a lado para conferir no PR.
6. As telas e componentes mudam nas partes seguintes (plano em `cerebro/frentes/visual-limpo.md`):
   componentes e busca geral (2), telas que já existem, uma por PR (3), claro/escuro e letra por
   pessoa (4).

## Alternativas descartadas
- Protótipos B ("Comanda", sem menu lateral) e C ("Turno"): o responsável escolheu o A.
- Trocar tudo num PR só: risco alto de quebrar telas sem perceber; vai em partes pequenas.
- Trilho só com ícones e nome na dica (como no protótipo): quem usa pouco o sistema não decora ícone;
  o nome curto embaixo do ícone resolve sem ocupar espaço.

## Consequências
A faixa escura do topo sai; a identidade fica no símbolo, na brasa da seção aberta, nos tons de café e
nas letras. Telas novas usam a casca como está; nenhuma tela monta menu próprio.

## Critério de aceite e evidência
Suíte de tela inteira verde (inclui o teste das cascas por cargo, nos 3 tamanhos, sem estourar a
largura e com alvos de 48 px). Fotos antes e depois no PR. Revisão independente (o menu nasce da
matriz de permissões).

## Adendo de 25/11/2026: exatamente igual ao protótipo, em toda tela
O responsável viu as fotos da parte 1 e pediu: "tudo deve seguir o mesmo layout do protótipo",
"quero exatamente igual", "vire uma identidade da marca para todas as abas". Por isso:
- **Acabamento único** em `apps/gestao/app/balcao.css`, que vale para toda tela dentro da casca:
  botões preenchidos sem borda grossa, campos de borda fina, cartões com contorno fino, lista em
  linhas, selos pequenos, abas em controle segmentado, tabela com cabeçalho em versalete, avisos com
  filete fino e **janela em gaveta à direita**. Alvo de 44 px no computador e 48 px no toque.
- **Topo como o do protótipo:** nome da tela, "aplicativo · pessoa" e o cargo em pílula, relógio,
  sino e conta (`TopoDaTela.tsx`). O `h1` igual ao nome da tela fica só para o leitor de tela.
- **Produtos como no protótipo:** filtros por categoria em chips, busca e botões na mesma linha,
  lista num cartão só com cabeçalho de colunas, linha com foto, nome, preparo, preço e ações.
- **Regra para toda aba nova:** guia `docs/visual-balcao.md`, skill `tela-da-gestao` e linha nas
  regras do `CLAUDE.md`. Nenhuma tela com layout, menu ou estilo próprio.
- **Exceção à ajuda em todo campo (0012), só para a busca da barra:** o campo `type=search` dentro de
  `.balcao-busca` segue o protótipo, com a lupa, um nome para o leitor de tela e um exemplo no próprio
  campo ("Buscar produto (ex.: X-Salada)"); sem a linha de explicação nem o "Ver exemplo". O teste
  `ajuda-nos-campos.spec.ts` confere o nome e o "ex.:". Todo outro campo continua com a ajuda completa.
