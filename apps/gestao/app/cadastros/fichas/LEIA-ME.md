# Tela de Fichas técnicas (E08)

Regra e motivo: `docs/decisoes/0025` (fichas técnicas) e migração `0019_fichas_tecnicas`. Regra no
servidor: `packages/dominio/src/fichas.ts`; o que a tela usa sem banco: `@erp/dominio/fichas`
(`fichas-comum.ts`: tipos, `Fracao`, `compararVersoes`, `escalarQuantidade`, nomes dos tipos).
Os tipos do painel e da ficha (`PainelDeFichas`, `FichaCompleta`, `ResumoDaFicha`) entram só como
`import type` da raiz `@erp/dominio` (somem no build; nenhum código de banco vai para o aparelho).

| Arquivo | Faz |
|---|---|
| `page.tsx` | Página da lista (servidor): a Casca confere `cadastros.ver`. |
| `[id]/page.tsx` | Ficha aberta (servidor): confere `cadastros.ver` e passa `podeGerenciar` (`cadastros.gerenciar`) e `podeVerCusto` (`custos.ver`), que só escondem botões e colunas. |
| `PainelDasFichas.tsx` | Abas: Fichas (busca, tipo, situação; desativadas e fora do cardápio no fim), No cardápio sem ficha ("Criar ficha"), Nomes parecidos, Custos (só quem vê custo). `?aba=custos` abre direto. |
| `CartaoDaFicha.tsx` | Uma ficha na lista: selo Completa / Incompleta (n pendências), versão, custo por porção ("parcial") e % do preço na loja e no delivery, com alerta acima do limite. |
| `CustosDeReferencia.tsx` | Limite do alerta (%) e o custo de referência de cada ingrediente ("R$ 45,90 por 1 kg"), com "Sem preço". |
| `FichaAberta.tsx` | Cabeçalho, pendências, itens (com custo por item para quem vê custo), rendimento, porção, tempo, validade, modo de preparo, equipamentos, observações, consumo por porção, "usado em", histórico; Editar, Desativar/Reativar e Versão para a cozinha. |
| `EditorDaFicha.tsx` | Janela que monta a receita inteira (nova ficha ou versão nova com `versaoBase`). |
| `HistoricoDaFicha.tsx` | Versões; compara uma antiga com a atual (`compararVersoes`), com ícone e palavra. |
| `VersaoDaCozinha.tsx` | Receita limpa e imprimível, sem custo, com "fazer 1x / 2x / 3x / outro" (`escalarQuantidade`). |
| `ImportarFichas.tsx` | Janela "Importar fichas" (só quem gerencia): arquivo .csv/.xlsx, Conferir, resultado por ficha (criar, versão nova, sem mudança, erro) com erros por linha, ingredientes que serão criados, "Criar os ingredientes que faltam" (muda a conferência: confere de novo) e "Gravar as boas e deixar de fora as com erro", Gravar. Bloco com as colunas e modelo .csv gerado na tela. |
| `contas.ts` | Conversões sem float: kg/L para g/ml (`quantidadeNaBase`), % para pontos-base, textos. Teste: `apps/gestao/testes/fichas-contas.teste.ts`. |
| `textos.ts` | Todos os textos e ajudas dos campos. |
| `fichas.css` | O pouco que é só desta tela, inclusive o `@media print` da versão da cozinha. |

API: `GET /api/fichas` (painel), `GET /api/fichas/[id]`, `GET /api/fichas/versao/[id]` (`cadastros.ver`;
custo nulo e `podeVerCusto=false` para quem não tem `custos.ver`). `POST /api/fichas`: sem `id` cria
(`tipo` + `produtoId` | `tamanhoId` | `adicionalId` | `nome` e `unidadeRendimento`, com `receita`);
com `id` e `receita` grava versão nova (`versaoBase` = versão aberta; se outra pessoa gravou antes,
volta 409 e a janela oferece abrir a mais nova); `{ id, ativo }` liga ou desliga. `POST /api/fichas/custo`
`{ ingredienteId, custoCentavos | null, quantidade }` (pede também `custos.ver`). `POST /api/fichas/limite`
`{ limiteCustoPb }` (35% = 3500). Erro volta como `{ mensagem }` e aparece na tela.

Importar: `POST /api/fichas/importar` `{ arquivo: { nome, conteudo (base64) }, aplicar, criarIngredientes, pularComErro, versoes }`
(regra em `packages/dominio/src/fichas-importar.ts`). `versoes` vai SEMPRE, com a chave `"tipo:nome"` e a
`versaoAtual` vista na conferência: se outra pessoa mudou a ficha nesse meio tempo, o servidor marca erro
em vez de gravar por cima. Planilha igual ao que já está gravado: o servidor não grava nada (`aplicado`
falso, "sem mudança") e a tela diz "Nada mudou".

Quantidade vazia num item = pendência (a ficha fica Incompleta e não baixa estoque). A tela nunca
arredonda escondido: o que não cabe em 4 casas na unidade da ficha é recusado com explicação.
Teste de tela: `apps/gestao/testes-tela/fichas.spec.ts`.
