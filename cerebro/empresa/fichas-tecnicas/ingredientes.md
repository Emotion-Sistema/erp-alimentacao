# Ingredientes das fichas técnicas

Lido em 15/11/2026 pela frente `fichas-tecnicas`, dos dois PDFs do Drive (pasta "Claude/05 Fichas
técnicas"): `Fichas_Tecnicas_Prontas_Emotion.pdf` (4 fichas) e `Fichas_Tecnicas_Pendentes_Emotion.pdf`
(55 fichas). São 59 fichas no total, numeradas de 1 a 59.

**Para que serve:** alimentar o catálogo do cadastro rápido (`packages/dominio/src/catalogo-ingredientes.ts`)
e a E08 (fichas técnicas). Nada aqui foi inventado: o que a ficha não diz está como "não informado" ou
virou pergunta em `perguntas.md`.

**Como ler:**
- **Unidade na receita:** a unidade em que a ficha gasta o ingrediente (g, ml ou un). Onde a ficha usa
  medida caseira (colher, pitada, folha), anoto isso e a unidade sugerida para o estoque, marcada
  como sugestão.
- **Embalagem/peso citado:** só o que a própria ficha diz sobre a compra ou o peso de uma unidade.
  As fichas quase nunca falam da embalagem de compra; quando ficar em branco, a casa informa.
- **Nº:** número das fichas que usam o ingrediente (resumo de cada uma em `resumo-das-fichas.md`).

## ✔ Conflitos com o catálogo do cadastro rápido (resolvidos em 19/11/2026)
O responsável respondeu às perguntas 1 e 2 (`perguntas.md`) e o catálogo foi corrigido (PR da
branch `feat/unidades-e-tipos`). Em todo cadastro a pessoa pode trocar a unidade sugerida.

| Ingrediente | Catálogo dizia | Fichas gastam em | Fichas | Resolvido (19/11/2026) |
|---|---|---|---|---|
| Laranja | un | g (5 un = 845 g) | 31 | **un** |
| Banana | un | g (2 un = 136 g) | 24 | **un** |
| Abacaxi | un | g (270 g = 8 pedaços) | 30 | **un** |
| Limão | un | g (1 un = 60 g), ml de suco e un | 10, 15, 28, 29, 32, 33, 36, 38, 6 | **un** |
| Alface | un | g (1 folha = 12 g) | 19, 21, 22 | **un** |
| Hambúrguer bovino | un | g (bife de 100 g) | 19, 21, 22 | **dois itens:** "Carne moída para hambúrguer" (feita na casa, **g**) e "Hambúrguer bovino pronto (disco)" (comprado, **un**) |
| Açaí | ml | g (200 g congelado) | 24 | **ml** |
| Leite condensado | g | ml (120 ml) | 29 | **ml** (sem embalagem sugerida: a de 395 g pede o peso, pergunta 9) |
| Chantilly | ml | g ("pesar por porção") | 56, 57 | **ml** |
| Creme de leite | g | ml (purê: caixa 200 ml) e g (creme triplo: caixa 200 g) | 2, 6, 44, 45 | **ml** (embalagem sugerida: caixa 200 ml) |
| Molho de tomate | g | ml (2.000 ml) e "unidades" | 6, 52 | **ml** (sem embalagem sugerida, pergunta 9) |

Ao passar as fichas para o sistema: onde a ficha pesa em g um item que conta em un ou ml (laranja,
alface, açaí...), a quantidade da ficha precisa ser convertida para a unidade do estoque.

## Hortifrúti
| Ingrediente | Unidade na receita | Nº | Embalagem/peso citado | Atenção |
|---|---|---|---|---|
| Alho | g | 1, 2, 4, 7, 10, 13 | 2 colheres de 5 ml = 22 g (ficha 1) | |
| Cebola | g | 3, 4, 5, 8, 9, 10, 13, 15, 54 | 1 un = 100 g (ficha 54) | Fichas 4, 5 e 8 só dizem "unidade", sem peso |
| Salsa (talo e folha) | g (sugestão) | 2, 4 | "1 molho" (ficha 2) | Sem peso nas duas |
| Cebolinha | g (sugestão) | 20 | | "A gosto" |
| Pimenta biquinho | g (sugestão) | 20 | | "A gosto" |
| Hortelã | g (sugestão) | 30, 33, 38 | contada em folhas (5 e 3 folhas) | Folha não tem peso |
| Limão-taiti | g ou ml de suco | 6, 10, 15, 28, 29, 32, 33, 36, 38 | 1 un = 60 g (28, 29); ½ un = 25 ml de suco (15) | No estoque: un (resolvido acima) |
| Limão-siciliano | ml de suco | 34, 37 | | Comprado à parte do taiti? |
| Laranja | g | 31 | 5 un = 845 g (≈169 g cada) | |
| Banana | g | 24 | 2 un = 136 g (68 g cada) | |
| Abacaxi | g | 30 | 8 pedaços = 270 g | Peso descascado; falta a perda da casca |
| Morango | g | 40 | | Sem dose |
| Berinjela | g | 3 | | |
| Pimentão | g | 3 | | Citado no preparo, sem quantidade |
| Batata (comum) | g | 8, 44, 53 | | Ficha 53 conta 6 unidades sem peso |
| Batata pequena (batatinha) | g | 12 | | O mesmo item da batata comum? |
| Batata Asterix | g | 23 | | |
| Cenoura | g | 8 | | |
| Tomate | g | 19, 21, 22, 47 | 2 rodelas = 16 g (22); 2 fatias = 20 g (47) | 19 e 21 sem peso |
| Alface | g | 19, 21, 22 | 1 folha = 12 g (22) | A planilha CSV registra "1 porção" |
| Gengibre fresco | não informado | 35 | | Só no preparo |

## Carnes, frios e peixe
| Ingrediente | Unidade na receita | Nº | Embalagem/peso citado | Atenção |
|---|---|---|---|---|
| Bacon fatiado | g | 11, 22, 46 | 1 fatia crua ≈ 24,25 g (11); 2 fatias = 28 g (22) | 22: cru ou pronto? |
| Bacon em cubos | g | 13, 18 | | O mesmo bacon cortado? |
| Bife de hambúrguer | g | 19, 21, 22 | 100 g cada | Comprado pronto ou moldado na casa? |
| Peito de frango | g | 6 | | |
| Frango (corte não dito) | g | 2, 52 | | O mesmo peito de frango? |
| Acém | g | 8 | | |
| Lombo suíno | g | 7, 9 | | |
| Costelinha suína | g | 7 | | |
| Carne-seca | g | 7 | | |
| Paio | g | 7 | | |
| Linguiça | g | 7 | | Tipo não dito |
| Pé, orelha e rabo suínos | g | 7 | | Três itens |
| Barriga suína (torresmo) | g | 20 | | |
| Bacalhau | g | 23 | 1 kg "cozido e desfiado" | Peso antes do dessalgue? |
| Presunto | g | 22, 46, 47, 48 | 1 fatia = 20 g | |

## Laticínios, ovos e sorvete
| Ingrediente | Unidade na receita | Nº | Embalagem/peso citado | Atenção |
|---|---|---|---|---|
| Leite integral | ml | 2, 5, 15, 24, 44, 49, 50, 51, 54, 56, 57 | | 51: "300" sem unidade |
| Manteiga | g | 5, 13, 19, 21, 22, 44 | 4 colheres = 100 g (44) | 19 e 21: "ponta de faca"; 22: 10 g |
| Margarina | g | 49 | | 2 colheres sem peso |
| Creme de leite | ml ou g | 2, 6, 44, 45 | caixa 200 ml (44); caixa 200 g (45) | No estoque: un (resolvido acima) |
| Leite condensado | ml | 29 | 1 copo medidor = 120 ml | |
| Muçarela | g | 17, 18, 19, 22, 45, 46, 47, 48, 52 | 1 fatia = 20 g; ½ xícara ralada = 75 g | Ralada e fatiada: o mesmo item? |
| Queijo coalho | g | 14 | 14 cubos = 120 g | |
| Cheddar | g | 45 | | |
| Parmesão | g | 45 | | |
| Requeijão | g | 45, 46, 59 | | 59 sem peso |
| Chantilly | g | 56, 57 | | Sem dose |
| Ovo | un | 22, 23, 50, 51, 52 | 1 ovo frito = 57 g (22) | 23 e 50 usam gema |
| Clara de ovo pasteurizada | ml | 37 | | Opcional, 15 ml |
| Sorvete Rafaello | g | 25 | 1 bola = 50 g | Ver pergunta sobre a 60 Sabores |
| Sorvete chocolate com avelã | g | 26 | 1 bola = 50 g | |
| Sorvete Kinder | g | 27 | 1 bola = 50 g | |
| Sorvete de creme | g | 57 | 150 g | |
| Sorvete (sabor do cliente) | g | 39, 58 | 1 bola ≈ 80 g (39); 1 bola = 60 g (58) | Bola de 50, 60 ou 80 g? |

## Mercearia
| Ingrediente | Unidade na receita | Nº | Embalagem/peso citado | Atenção |
|---|---|---|---|---|
| Arroz | g | 1 | pacote 5 kg | |
| Feijão | g | 7 | | Preto ou carioca? |
| Farinha de trigo | g | 5, 49, 50, 51, 54 | | 5: colheres; 50: "cerca de 1.100"; 51: "300" sem unidade |
| Farinha de mandioca | g | 13 | | |
| Farinha de rosca | g | 23, 52 | | 52: 1 kg "disponível", consumo a medir |
| Farofa pronta | g | 13 | | Comprada pronta |
| Fubá | g | 51 | | "300" sem unidade |
| Amido de milho | g | 2 | | Sem quantidade |
| Açúcar | g | 6, 28, 30, 50, 51 | 1 colher rasa = 25 g (6) | Tipo não dito |
| Sal | g | 1, 3, 4, 5, 6, 7, 8, 9, 12, 15, 20, 49, 50, 53, 54 | 2 colheres de 5 ml = 18 g (1); "1 colher = 25 g" (várias) | Muitas fichas em colher |
| Sal kosher | g | 36 | | Borda, opcional |
| Óleo (soja) | ml | 1, 4, 6, 13, 15, 44, 50, 51 | | 51: "300" sem unidade |
| Óleo para fritura | ml | 16, 18, 20, 23, 49, 52 | fritadeira 4 L (16 a 18) | Falta o óleo gasto por porção |
| Óleo de algodão | ml | 17 | 4 L | Só a ficha 17 diz algodão |
| Azeite | ml | 3, 12, 23 | | |
| Vinagre | ml | 3, 15 | | 15: 5 ml ou 1 colher de sopa |
| Azeitona | g | 2, 3 | | |
| Milho em conserva | lata | 2 | 2 latas | Peso drenado não dito |
| Uva-passa | g | 3 | | |
| Nozes | g | 3 | | |
| Amendoim | g | 24, 40 | | 40 sem dose |
| Batata palha | g | 19, 21, 22 | "1 medidor verde" = 10 g? (22 diz 10 g) | |
| Goiabada | g | 14 | | Sem peso |
| Fermento químico | g | 2, 51 | | 2: "pó Royal", uma pitada; 51: tipo não dito |
| Fermento biológico seco | g | 50 | 10 g (ou 30 g) | |
| Molho de tomate | ml | 6, 52 | "4 unidades" (6) | No estoque: un (resolvido acima) |
| Molho ao sugo | não informado | 54 | | Comprado ou feito? |
| Mostarda | g | 10 | | |

## Temperos e caldos
| Ingrediente | Unidade na receita | Nº | Embalagem/peso citado | Atenção |
|---|---|---|---|---|
| Fondor (Maggi) | g | 13, 16, 17, 18 | 1 medida de 1,25 ml = 1 g | |
| Chimichurri | g | 10, 12, 15 | | 10: colher de 10 ml |
| Manjericão | g (sugestão) | 10 | | Colher de 10 ml; seco ou fresco? |
| Orégano | g | 3, 12 | | 3: colher de 30 ml |
| Açafrão-da-terra | g | 12, 53 | | 53: 1 colher |
| Alho granulado | g | 12 | | |
| Pasta de alho | g (sugestão) | 12 | | 4 colheres de sopa; comprada ou é a ficha 4? |
| Pimenta calabresa | g | 12 | | |
| Pimenta-do-reino | g | 5, 54 | | 5: uma pitada |
| Pimenta (tipo não dito) | g | 6 | 1 colher = 25 g | |
| Páprica | g | 6 | | Sem dose ("?" no original) |
| Noz-moscada | g | 5, 54 | | 5: uma pitada |
| Louro | g ou folha | 5, 7, 54 | | 5 e 54 em folhas |
| Cravo-da-índia | un ou g | 5, 54 | | 10 unidades |
| Colorau | g | 49 | | 1 colher de chá |
| Caldo de carne | g | 15 | 2 cubos = 20 g | |
| Caldo de galinha (tablete) | un | 49 | | 2 tabletes |
| Caldo de galinha em pó | g | 49 | | 1 colher de sopa |
| Tempero da casa | g | 6, 52 | 3 colheres = 75 g (6) | É a ficha 4? |
| Tempero de alho | g | 8 | | 50 g ou 150 g/kg |
| Tempero de alho e sal | g | 44 | | |
| Tempero (sem nome) | g | 9, 23 | | "A gosto" |
| Pimenta-da-jamaica | não informado | 35 | | Opcional, só no preparo |
| Gengibre em pó | não informado | 35 | | Só na finalização |

## Cafeteria
| Ingrediente | Unidade na receita | Nº | Embalagem/peso citado | Atenção |
|---|---|---|---|---|
| Café expresso (máquina) | ml | 25 | 30 ml | Quanto café em grão por dose? |
| Cappuccino da máquina | ml | 26 | 60 ml | Qual pó a máquina usa? |
| Cappuccino com avelã (máquina) | não informado | 27 | | Sem dose |
| Pó de cappuccino | g | 56, 57 | | |
| Café em pó | g | 55 | 10 g ≈ 1 colher de sopa | |
| Nutella | g | 26, 39, 40, 56, 57 | | 26: 2 g; 40: ≈10 g; demais sem dose |
| Calda de avelã | g | 26 | ¼ concha = 5 g | |
| Calda de cookies | g | 27 | ¼ concha = 5 g | |
| Cookies & cream (decoração) | g | 27 | | 2 g |
| Calda de chocolate | g | 39, 40 | | Sem dose |
| Ovomaltine em pó | g | 56 | | Sem dose |
| Açaí congelado | g | 24 | | |
| Guaraná | ml | 24 | | Refrigerante ou xarope? |
| Calda de licor | não informado | 58 | | Opcional, sem ficha |
| Gelo | g | 26, 27, 28, 29, 30, 32 a 38 | 1 pá = 40 g; 1 medida padrão = 40 g | É item de estoque? |
| Água filtrada | ml | 28, 29, 30 | | Entra no estoque? |
| Água com gás | ml | 38 | | "Completar" |

## Bar (coquetéis)
| Ingrediente | Unidade na receita | Nº | Dose citada |
|---|---|---|---|
| Vodca | ml | 32 | 45 ml |
| Cointreau | ml | 32 | 23 ml |
| Licor de laranja Curaçao | ml | 33 | 23 ml |
| Licor de laranja (marca não dita) | ml | 36 | 15 ml (é o Cointreau?) |
| Rum branco | ml | 33, 35, 38 | 45 ml; 60 ml no mojito |
| Rum escuro | ml | 33 | 15 ml |
| Gin | ml | 34 | 60 ml |
| Licor maraschino | ml | 34 | 15 ml |
| Creme de violeta | ml | 34 | 8 ml |
| Tequila blanco | ml | 36 | 60 ml |
| Bourbon | ml | 37 | 60 ml |
| Angostura | gotas | 37 | 3 a 4 gotas |
| Ginger ale | ml | 35 | 60 ml |
| Suco de cranberry | ml | 32, 35 | 15 ml |
| Suco de cereja azeda | ml | 35 | 8 ml |
| Xarope orgeat | ml | 33 | 15 ml |
| Xarope simples | ml | 37, 38 | 15 ml |
| Xarope simples rico | ml | 35 | 15 ml |
| Xarope de agave | ml | 36 | 15 ml |
| Cereja em conserva | un | 34 (33 opcional) | 1 |

## Comprados prontos (gastos por unidade)
| Item | Unidade | Nº | Peso citado | Atenção |
|---|---|---|---|---|
| Pão brioche | un | 19, 21, 22 | 59 g | Exceção aceita: por unidade |
| Brownie | un | 39, 40 | ≈75 g, "variando" | Exceção aceita; comprado ou feito? |
| Pão de queijo recheado (goiabada) congelado | un | 41 | | |
| Pão de queijo 3 queijos congelado | un | 42 | 36 g cru, 32 g pronto (1 amostra) | |
| Pão de queijo congelado (sabores) | un | 43 | 44 g (1 amostra) | Quantos sabores? |
| Mini pão de queijo | un | 59 | | Sem peso |
| Batata congelada | g | 16, 17, 18 | 400 g por porção | |
| Torta da Gisele | g (fatia) | 58 | fatia ≈160 g | Comprada inteira? Quantas fatias? |
| Nhoque | não informado | 54 | | Comprado ou feito? |

## Material de consumo (não é ingrediente, mas gasta)
| Item | Unidade | Nº | Citado |
|---|---|---|---|
| Papel-toalha | folha | 11, 16, 17, 18 | 6 folhas por lote de bacon |
| Filtro de drip coffee | un | 55 | 1 por copo |
| Recipiente de requeijão (porção) | un | 59 | 1, "se descartável" |

## Preparos da casa usados como ingrediente (subreceitas)
Estes têm ficha própria e entram em outras fichas. Na E08 precisam ser "ingrediente produzido".
| Preparo | Ficha | Rende | Usado em |
|---|---|---|---|
| Bacon fatiado pronto | 11 | 138 g (12 fatias) | 19? 22? (perguntar) |
| Farofa com bacon | 13 | 840 g | porções na pedra e no espeto |
| Tempero | 4 | ≈500 g | "tempero da casa" (6, 52)? |
| Maionese caseira temperada | 15 | ≈700 ml | hambúrgueres 19, 21, 22? |
| Molho bechamel | 5 | ≈2 L | nhoque 54? (a 54 traz outra receita) |
| Creme Triplo Cheese | 45 | 350 g | não dito |
| Massa de coxinha | 49 | 10 salgados | coxinha |
| Massa para salgado assado | 50 | não informado | 46, 47, 48 ("massa comum")? |

## Contagem
Cerca de 160 itens nas tabelas acima, nas 59 fichas, contando cada sorvete e cada bebida do
bar como item. Os nomes acima estão como nas fichas. Unificar nomes (ex.: "frango" e "peito de
frango") depende das respostas em `perguntas.md`.
