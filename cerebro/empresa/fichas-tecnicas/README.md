# Fichas técnicas da empresa

Organizado pela frente `fichas-tecnicas` (`cerebro/frentes/fichas-tecnicas.md`). A fonte é o Drive,
pasta "Claude/05 Fichas técnicas": "Prontas" (`Fichas_Tecnicas_Prontas_Emotion.pdf`, 4 fichas) e
"Para atualizar" (`Fichas_Tecnicas_Pendentes_Emotion.pdf`, 55 fichas). O Drive é caixa de entrada; a
verdade é este repositório.

| Arquivo | O que tem |
|---|---|
| `ingredientes.md` | Todos os ingredientes, com a unidade em que a receita gasta e a embalagem citada. **Alimenta o catálogo do cadastro rápido e a E08** |
| `resumo-das-fichas.md` | As 59 fichas: produto, ingredientes, quantidades, rendimento; marca o que falta e o que não fecha |
| `para-atualizar.md` | As 55 fichas pendentes e o que falta em cada uma, com prioridade |
| `cardapio-x-fichas.md` | O cardápio (Drive, pasta 06, recebido em 18/11/2026) com preço, produto a produto, e a ficha que atende cada um; lista dos produtos sem ficha |
| `analise-das-fichas.pdf` | PDF de 8 páginas (18/11/2026; título ou subtítulo nunca fica sozinho no fim da página, pedido do responsável), na voz do responsável, para a nutricionista, assinado no rodapé por Wilians Duque (programador, pedido dele): o que está bom, erros que se repetem, inconsistências, o que falta, fichas a criar, ordem de correção e as 30 perguntas com espaço para resposta (mesma numeração de `perguntas.md`) e, em anexo, as 59 fichas como estão, em duas colunas |
| `logo-provisoria/` | Logo provisória da E-MOTION (recebida em 18/11/2026 como arte de tapete 150x100 cm): `logo-emotion.png` (completa, fundo transparente, 1600 px), `logo-emotion-simbolo.png` (só os ícones, 900 px) e as duas em JPG com fundo branco (usadas no PDF). Laranja da marca: #E77019 |
| `gerar-pdf-analise.py` | Gera o `analise-das-fichas.pdf` (lê `resumo-das-fichas.md`). Rodar da raiz: `python3 cerebro/empresa/fichas-tecnicas/gerar-pdf-analise.py cerebro/empresa/fichas-tecnicas/analise-das-fichas.pdf` |
| `perguntas.md` | O que só o responsável responde (nada foi inventado) |
| `insumos-por-porcao-recebido.csv` | Planilha enviada pelo responsável em 15/11/2026: consumo por porção das fichas 11, 13, 22, 24 e 31 (separador `;`, vírgula decimal). Confere com os PDFs, com duas diferenças: alface "1 porção" (a ficha 22 diz 12 g) e ovo "1 unidade" (a ficha diz 57 g). Preço e custo vazios |

Ao atualizar uma ficha no Drive, a frente relê o PDF e muda estes arquivos; o que mudar no
`ingredientes.md` é avisado no mural.
