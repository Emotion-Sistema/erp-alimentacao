# 0019: marca E-MOTION aplicada ao sistema

- Data: 18/11/2026
- Status: aceita
- Assunto da sessão: identidade visual (pedido do responsável: "aplique a todo o ERP")
- Complementa: decisão 0012 (tema por variáveis; gestão sempre clara). Fonte da marca:
  `cerebro/empresa/paleta-da-marca/` (paleta, letras e regras aprovadas em 18/11/2026) e
  `cerebro/empresa/fichas-tecnicas/logo-provisoria/` (logo provisória).

## Decisão
1. **Cores:** clima "Espuma e Brasa" no `packages/interface/src/tema.css`, com os nomes de antes e as
   variáveis novas da marca (`--cor-cartao`, `--cor-borda-suave`, `--cor-primaria-hover`, `--cor-preco`,
   `--cor-marca`, `--cor-ambar`, `--cor-ouro(-texto)`, `--cor-faixa-escura(-texto/-suave)`). Espelho em
   `cores.ts` para manifesto e ícones. Nenhuma cor fora de `tema.css`, `publico.css` e `cores.ts` (teste).
2. **Letras dentro do app** (pacotes `@fontsource` 5.3.0, só os pesos usados, nada do Google em tempo
   de execução): equipe (`gestao`) em Atkinson Hyperlegible Next 400/700; cliente (`loja`, `site`) em
   Fraunces 400/600/700 (títulos, produto, preço) e Figtree 400/600/700 (texto).
3. **Modo escuro "Noite de Torra" só nos apps do cliente**, sozinho quando o aparelho está escuro, em
   `packages/interface/src/publico.css`. A gestão continua sempre clara (0012).
4. **Forma e luz:** cartões em leite fresco com borda suave, sombras quentes em camadas (tom de café,
   nunca cinza), brilho de cima nos botões cheios, foco brasa com brilho âmbar, raio 12/16 px.
   Divisões em `--cor-borda-suave`; `--cor-borda` (3:1) só em campo e botão de contorno.
5. **Casca da gestão:** faixa de café no topo (a única faixa escura da tela) com a logo para fundo
   escuro, o aplicativo em dourado e quem está usando; filete da marca embaixo; menu em abas sobre
   nata, aba aberta em brasa. Entrada com a logo grande.
6. **Arquivos da marca** gerados por `scripts/gerar-marca.py` em `apps/*/public/marca/` (logo em WebP,
   ícones PNG, favicon) e `packages/interface/src/simbolo-base64.ts` (símbolo nos ícones SVG dos
   aplicativos). Refazer quando a logo definitiva chegar.
7. Regras de uso da paleta valem no código: laranja e âmbar da logo nunca como letra (teste), um botão
   forte por tela, cor nunca fala sozinha.

## Consequências
Trocar a marca de novo é trocar valores nesses três arquivos e rodar o gerador. Telas novas usam as
variáveis e as classes do tema; nada de cor escrita na tela.

## Critério de aceite e evidência
`packages/interface/testes/cores.teste.ts`: espelho `cores.ts`, contraste AA de todos os pares de leitura
e selos no claro e no escuro, borda de campo 3:1, laranja/âmbar nunca em `color:`. `sem-cor-fixa.teste.ts`.
Suíte de tela inteira verde; fotos das telas no PR.
