# Frente: paleta-da-marca

Aberta em 18/11/2026 pelo responsável. Função: criar a paleta de cores da marca E-MOTION
(Coffee · Grill · Express) a partir da logo provisória, para site, delivery, cardápio, telas internas
e impressos. **Sem código do sistema.** Escreve só aqui, em `cerebro/empresa/paleta-da-marca/` e no mural.
Registro da ideia: `cerebro/ideias-do-cliente.md`, nº 7.

## Feito em 18/11/2026
- Paleta proposta em `cerebro/empresa/paleta-da-marca/README.md`: nomes, códigos, proporção 70/20/10,
  papel de cada cor com contraste conferido (todo texto >= 4,5:1), modo escuro "Noite de Torra",
  três climas (Espuma e Brasa, recomendado; Café com Creme; Brasa e Ouro), regras de uso e impressos.
- Página de amostra `amostra.html` (publicada, privada: https://claude.ai/artifact/MV92y1Eiz2pUC62z7wMZm9).
- `tema-aprovado.css` (era `tema-proposta.css`): o clima escolhido já com os nomes de variáveis do `tema.css` atual.
- Logo para fundo escuro: feita aqui e depois substituída pelas variações oficiais da frente fichas-tecnicas
  (`cerebro/empresa/fichas-tecnicas/logo-provisoria/`); o arquivo daqui foi retirado para não haver duas versões.

## Decidido
- Cores da logo ficam iguais em todos os climas; o laranja #E77019 é só enfeite (3,0:1, não serve para letra).
- Botão do modo claro em brasa mais funda (#B8470E) para a letra clara passar de 4,5:1.
- Conversão para gráfica (CMYK/Pantone) não foi inventada: depende de prova de cor da gráfica.

## Escolha do responsável (18/11/2026)
- Clima **Espuma e Brasa**; tema **claro por padrão**; escuro **só** quando o aparelho do cliente estiver
  no modo escuro. Hipótese registrada: vale para site, delivery e app do cliente; o interno segue sempre claro (0012).
- Recado ao chat principal no mural com o que trocar. A frente não mexe no código.

## Letras (18/11/2026)
- Pergunta do responsável: qual letra combina. Proposta: Fraunces + Figtree para o cliente, Atkinson Hyperlegible
  Next para a equipe (detalhe em `cerebro/empresa/paleta-da-marca/README.md`; seção "Letras" na amostra). **Aprovadas pelo responsável em 18/11/2026**; recado no mural.
- Arquivos das letras baixados (pedido dele, para não depender do Google): `cerebro/empresa/paleta-da-marca/letras/`, com licenças.

## Falta
- Chat principal aplicar no tema (quando couber no roteiro). Depois disso, a frente pode ser encerrada.

## Pacote final (18/11/2026, pedido do responsável: "deixe tudo perfeito e correto para ser usado")
- `tema-aprovado.css` completo: todas as variáveis do `tema.css` atual, os 9 selos em tons da marca (claro e
  escuro), `--cor-ouro-texto`, letras, espelho do `cores.ts`. Contraste conferido por script em todos os pares:
  menor 5,2:1 (claro) e 7,0:1 (escuro); borda de campo >= 3:1.
- Amostra marcada como aprovada (Espuma e Brasa "Escolhido").
- Cópia no Drive, pasta "07 Identidade visual" (pedido do responsável).
