# Frente: fichas-tecnicas

Aberta em 15/11/2026 pelo responsável. Função: ler as fichas técnicas da empresa no Google Drive
(pasta "Claude/05 Fichas técnicas", subpastas "Prontas" e "Para atualizar") e organizar o conteúdo.
**Sem código do sistema.** Escreve só aqui, em `cerebro/empresa/fichas-tecnicas/` e no mural.
Situação em 18/11/2026: **parada, esperando as respostas das 30 perguntas** (o responsável só as tem a
partir de 22/11/2026; vão vir da nutricionista, pelo PDF).

## O que foi feito (síntese de todas as conversas)
### 15/11/2026
- Lidos por inteiro os dois PDFs do Drive: `Fichas_Tecnicas_Prontas_Emotion.pdf` (fichas 11, 13, 24, 31) e
  `Fichas_Tecnicas_Pendentes_Emotion.pdf` (55 fichas e a auditoria). Total: 59 fichas.
- O responsável mandou a planilha `Insumos_por_Porcao_Emotion_ERP.csv` (consumo por porção das fichas 11, 13,
  22, 24, 31); copiada como `insumos-por-porcao-recebido.csv`.
- Criados em `cerebro/empresa/fichas-tecnicas/`: `ingredientes.md` (lista para o catálogo e a E08),
  `resumo-das-fichas.md`, `para-atualizar.md`, `perguntas.md` e `README.md` (índice da pasta). PR 35.
### 18/11/2026
- **Cardápio** (Drive, "06 Cardápio e produtos", `Catalogo_E-MOTION_Atualizado.txt`) lido e cruzado com as fichas:
  `cardapio-x-fichas.md` (produto, preço, ficha; cerca de 100 produtos sem ficha; revenda à parte).
  Perguntas passaram a 30. PR 59.
- **PDF para a nutricionista** `analise-das-fichas.pdf` (8 páginas), feito e refeito a pedido (PRs 60, 62, 64,
  65, 66, 67): na voz do responsável; o que está bom; erros que se repetem (com os números das fichas, sem
  ensinar a fazer ficha, porque a casa tem nutricionista); inconsistências com o número da pergunta; o que
  falta; fichas a criar; fichas fora do cardápio; ordem de correção; as 30 perguntas com linhas para
  resposta; anexo com as 59 fichas em duas colunas; rodapé com "Wilians Duque, programador do sistema";
  logo no cabeçalho e no rodapé; títulos no laranja da marca. Gerador: `gerar-pdf-analise.py`.
- Preferências do responsável sobre PDF: curto e cirúrgico, sem textão; título ou subtítulo nunca sozinho
  no fim da página (mas sem forçar cada seção a começar em página nova).
- **Logo provisória** recebida (arte de tapete 150x100 cm): recortada, sem fundo, 27 variações em
  `cerebro/empresa/fichas-tecnicas/logo-provisoria/` (guia no `LEIA-ME.md`) e 32 arquivos no Drive, em
  "07 Identidade visual/Logo provisória (variações)". Os dois PNG HD sem fundo (4 MB, acima do limite de envio)
  foram para o Drive reduzidos a 2400 px, a pedido do responsável (`logo-completa-2400px-*.png`).
- **Paleta de cores:** desvio anotado; vai para a frente `paleta-da-marca` (bloco entregue ao responsável
  para outro chat). Cores medidas na logo: âmbar #F6A52B, laranja #F7750E, laranja do texto #E77019,
  vermelho-brasa #C9370C, caramelo #CA611D, café #351E17, creme dourado #F6DD8C, quase-preto #131111.

## Achados que importam ao chat principal
- **Unidade do catálogo do cadastro rápido x fichas:** 11 itens divergem (laranja, banana, abacaxi, limão,
  alface e hambúrguer: catálogo em un, fichas em g; açaí ml x g; leite condensado g x ml; chantilly ml x g;
  creme de leite e molho de tomate mistos). Tabela no topo de `ingredientes.md`. A unidade fica fixa
  (decisão 0015): resolver antes de cadastrar esses itens.
- Para a baixa (RC-01), além das 4 prontas, já servem a 22 (Cheese Tudo) e umas 10 outras (lista em
  `resumo-das-fichas.md`).
- Subreceitas (preparos usados em outras fichas): 4, 5, 11, 13, 15, 45, 49, 50. A E08 precisa de
  "ingrediente produzido".
- Cardápio x fichas: Cheese Tudo com peito de peru no cardápio e presunto na ficha; hambúrgueres acompanham
  150 g de batata que as fichas não contam; sucos de 300 ml no cardápio e 250 ml nas fichas.
- Sorvetes das fichas de cafeteria podem vir da 60 Sabores (franquia, RC-11): pergunta 6.

## Decisões
- Nada de quantidade ou ingrediente inventado: dúvida vira pergunta em `perguntas.md` (mesma numeração do PDF).
- Unidade "sugerida" só onde a ficha usa medida caseira; marcada como sugestão.
- O Drive é caixa de entrada; a verdade é o repositório.

## Próximo passo
1. Quando chegarem as respostas (a partir de 22/11/2026): marcar ` ✔ resposta (data)` em `perguntas.md`,
   atualizar `ingredientes.md`, `resumo-das-fichas.md`, `para-atualizar.md` e `cardapio-x-fichas.md`, avisar
   o principal no mural do que mudou no `ingredientes.md` e refazer o PDF com `gerar-pdf-analise.py`.
2. Quando fichas corrigidas chegarem ao Drive (pasta Prontas): reler e atualizar.
