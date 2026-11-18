# Letras da marca (arquivos)

Baixadas em 18/11/2026 do Google Fonts, a pedido do responsável, para não depender do Google.
Aprovadas em 18/11/2026 (ver `../README.md`, seção "Letras"). Licença livre SIL OFL 1.1 (arquivos
`LICENCA-*.txt` junto): pode usar no sistema, no site e na gráfica; a licença deve acompanhar os arquivos.

| Arquivo | Letra | Peso | Uso |
|---|---|---|---|
| `Fraunces-Regular.ttf` / `-SemiBold` / `-Bold` | Fraunces | 400 / 600 / 700 | cliente: títulos, nome de produto, preço |
| `Figtree-Regular.ttf` / `-SemiBold` / `-Bold` | Figtree | 400 / 600 / 700 | cliente: texto, botões, rótulos |
| `AtkinsonHyperlegibleNext-Regular.ttf` / `-Bold` | Atkinson Hyperlegible Next | 400 / 700 | sistema interno, tudo |

Conferido: todos têm os acentos do português (ã, õ, ç, é, ª, º, “ ”, –). Sem itálico (não foi pedido).

## Para o sistema (chat principal)
O jeito mais limpo é instalar os pacotes `@fontsource/fraunces`, `@fontsource/figtree` e
`@fontsource/atkinson-hyperlegible-next` (versão 5.3.0 em 18/11/2026, licença OFL-1.1): os arquivos
vão dentro do build e nada é buscado no Google. Estes `.ttf` servem de alternativa (`next/font/local`)
e para a gráfica e quem fizer peças da marca. Nos apps, preferir `woff2` (mais leve), que os pacotes já trazem.
