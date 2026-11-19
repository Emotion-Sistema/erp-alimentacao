# Tela de Importar planilha

Regra e motivo: `docs/decisoes/0020-importar-planilha.md`. Regra no servidor:
`packages/dominio/src/importar.ts` (conferir, gravar, modelo) e `planilha-ler.ts` (lê .xlsx, .csv e
.html). O que a tela usa (sem banco): `@erp/dominio/importar` (`importar-comum.ts`: campos, nomes de
coluna aceitos, tipos da conferência, `resumir`, `relatorioDeErros`). Componente cliente nunca importa
`@erp/dominio` raiz.

| Arquivo | Faz |
|---|---|
| `page.tsx` | Página (servidor): exige `cadastros.gerenciar`; `?tipo=ingredientes` ou `produtos` escolhe o tipo inicial. |
| `ImportarPlanilha.tsx` | Os 5 passos: tipo e modelo, arquivo, mapa de colunas, resultado (resumo, filtro, linhas, Pular, relatório) e Gravar. |
| `CorrigirNoPainel.tsx` | "Corrigir aqui" (ideia nº 13): campos de uma linha (um por coluna, a com problema destacada, lista de opções nas colunas de escolha), "n correções feitas" com Desfazer e "Baixar a planilha corrigida". Usado também por `../fichas/ImportarFichas.tsx`. |
| `textos.ts` | Textos desta tela (`TI`) e de Corrigir no painel (`TC`). |
| `importar.css` | Estilo próprio (prefixo `imp-`); a base vem de `../horarios/horarios.css`. Só variáveis do tema. |

Rotas (todas `cadastros.gerenciar`, na matriz da API):
- `POST /api/cadastros/importar/conferir` com `{ tipo, arquivo: { nome, conteudo (base64) }, mapa?, pular?, correcoes?, devolverTabela? }`:
  devolve a `Conferencia` (chave, colunas, mapa, linhas com situação, resumo; nas linhas com erro, `celulas` e o
  `indice` da coluna de cada problema; `opcoes` dos campos de escolha; `tipoSugerido`/`avisoDoTipo` quando o tipo
  parece trocado; `tabela` só com `devolverTabela`). Não grava nada.
  `correcoes: { linha, coluna, valor }[]` (linha como na planilha, coluna 0 = A, até 2.000, valor até 500 letras):
  o servidor aplica sobre a tabela lida ANTES de conferir, e de novo ao gravar; entram na assinatura da chave.
- `POST /api/cadastros/importar/gravar` com o mesmo corpo e a `chave`: 201 na primeira vez, 200 com
  `repetida: true` se a mesma chave voltar. Recusa (400) se sobrar linha com erro sem Pular.
- `GET /api/cadastros/importar/modelo?tipo=produtos&formato=xlsx` (ou `csv`): o modelo para baixar.

Botões que abrem esta tela: "Importar planilha" no topo de Ingredientes (`../Ingredientes.tsx`) e de
Produtos (`../produtos/ListaDeProdutos.tsx`), só para quem pode gerenciar.

Pular: só aparece nas linhas com erro (ou já puladas). A conta do resumo é feita na tela com
`resumir`; o servidor conta de novo ao gravar. Mudar o mapa de colunas confere de novo no servidor.

Testes: `apps/gestao/testes-tela/importar.spec.ts` (arquivos de exemplo em
`apps/gestao/testes-tela/arquivos/`, dados inventados) e a ajuda dos campos em
`ajuda-nos-campos.spec.ts`.
