---
name: tela-da-gestao
description: Criar ou mudar qualquer tela, aba, seção, janela ou componente da gestão interna (apps/gestao) no visual Balcão, a identidade da marca (decisão 0028). Use SEMPRE que a tarefa criar uma aba nova, uma tela nova, um cadastro, uma lista, um painel ou mudar o layout de algo em apps/gestao, mesmo que o pedido não fale em visual.
---

# Tela da gestão no visual Balcão

O responsável aprovou o protótipo A e pediu: **toda aba nova sai exatamente igual ao protótipo**
(25/11/2026). Guia completo: `docs/visual-balcao.md`. Referência: `cerebro/frentes/visual-limpo/prototipos.html`.

## Receita
1. Abra o protótipo A na tela mais parecida (Produtos, Fichas, Estoque, Mesas, Produção, Início) e
   copie a disposição: frase curta, barra de ferramentas, lista num cartão, gaveta à direita.
2. Item de menu: no catálogo `packages/dominio/src/aplicativos.ts`, com ação da matriz, `icone` e,
   se o nome for longo, `curto`. Nunca menu próprio na tela.
3. Página dentro da `Casca` (com `exige`). `h1` com o mesmo nome do item (o topo mostra; o h1 fica
   para o leitor de tela). Logo abaixo `<p className="hor-tela__intro">` com uma frase.
4. Barra: `balcao-barra` > `balcao-chips` (botões `balcao-chip` com `aria-pressed`) + `balcao-acoes`
   (`balcao-busca` com `<input type="search">`, botão secundário, botão principal por último).
5. Lista: `balcao-lista` (um cartão) com `balcao-lista__cab` (colunas) e linhas `hor-cat`; grupos em
   `section.hor-secao > h2`. Ações da linha: `Botao variante="secundario"` dentro de `hor-cat__acoes`.
6. Formulário: `<dialog className="janela">` (vira gaveta à direita sozinho) e campos do `Campo.tsx`
   (explicação + exemplo, decisão 0012).
7. Estados: carregando, vazio (`hor-vazio` com o próximo passo) e erro (`Aviso tipo="perigo"`).
8. Nada de cor escrita, borda de 2 px, cartão dentro de cartão, letra grande ou sombra forte.
   Estilo próprio da tela só para o que é dela, no CSS da pasta, usando as variáveis do tema.

## Antes do PR
- `pnpm teste:tela cascas.spec.ts` e olhe as fotos nos 3 tamanhos; compare com o protótipo.
- Fotos antes/depois: `pnpm exec tsx scripts/comparar-telas.ts <antes> <depois> <saida.html>`.
- Tela nova entra no `cascas.spec.ts` (já entra sozinha se estiver no catálogo).
