# Tela de Produtos

Regra e motivo: `docs/decisoes/0018-produtos.md`. Regra no servidor:
`packages/dominio/src/produtos.ts`; o que a tela usa (sem banco): `@erp/dominio/produtos`
(`produtos-comum.ts`: tipo `Produto`, `centavosDoTexto`, `textoDosCentavos`, limites de preço e
de tempo). Componente cliente nunca importa `@erp/dominio` raiz.

| Arquivo | Faz |
|---|---|
| `page.tsx` | Página (servidor): confere `cadastros.ver` e passa `podeGerenciar` (`cadastros.gerenciar`). |
| `ListaDeProdutos.tsx` | Lista por categoria (na ordem do cardápio), desativados no fim; novo, editar, desativar com "Desfazer". Sem categoria ativa, explica e leva para Categorias. |
| `CartaoDoProduto.tsx` | Um cartão: "Nº na categoria", nome, preço, tipo de produção (ou "Não passa pela produção"), tempo de preparo, descrição, Editar e Desativar/Reativar. |
| `JanelaDoProduto.tsx` | Janela de novo ou editar: nome, categoria (só as ativas), preço em reais, tipo de produção (ou não passa), tempo (só com tipo), descrição e posição na categoria com `../PosicaoNaLista.tsx`. |
| `TamanhosDoProduto.tsx` | Seção "Tamanhos" da janela: nome e acréscimo (e acréscimo no delivery, se o produto tem preço próprio lá ou a pessoa pedir), subir, descer, remover, até 10. |
| `AdicionaisDoProduto.tsx` | Seção "Adicionais" da janela: os grupos ligados, na ordem; para adicionar, só os ativos; um ligado e depois desativado aparece "desativado" e pode ser tirado. |
| `PreviaDoPreco.tsx` | Quadro "Quanto fica": preço de cada tamanho na loja e no delivery com `precoDoItem` (a regra do servidor), "a partir de" com a escolha obrigatória mais barata. Só leitura. |
| `textos.ts` | Textos desta tela. |
| `produtos.css` | O pouco que é só desta tela (o preço). O resto vem de `../horarios/horarios.css`. |

A tela lê três rotas: `GET /api/cadastros/produtos`, `GET /api/cadastros/categorias` e
`GET /api/cadastros/tipos-producao` (todas `cadastros.ver`). Grava em `POST /api/cadastros/produtos`
(`cadastros.gerenciar`): sem `id` cria (nome, categoria e preço obrigatórios), com `id` altera e o
campo ausente fica como está; desativar manda só `{ id, ativo }`. `tipoProducaoId: null` = não passa
pela produção (o servidor tira o tempo junto). Erro volta como `{ mensagem }`.

Preço: a pessoa digita em reais ("25,90"); a tela converte com `centavosDoTexto` e manda
`precoCentavos` inteiro. Nunca número com vírgula (float).

Delivery, tamanhos e adicionais (decisão 0021): "Mesmo preço da loja" marcado manda
`precoDeliveryCentavos: null`. Ao salvar, a janela manda SEMPRE `tamanhos` (lista completa, na ordem,
com o `id` dos que já existiam; acréscimo do delivery vazio = `null`, igual à loja) e
`gruposAdicionais` (ids na ordem). O que não vier fica inativo no servidor. A janela também lê
`GET /api/cadastros/adicionais`. O cartão mostra, discreto, "Delivery R$ X" (se for outro), "N
tamanhos" (o preço vira "a partir de") e "N grupos de adicionais". Os grupos têm tela própria:
`../adicionais/`.

Posição: a lista é a dos produtos ativos da categoria escolhida. Trocar a categoria na janela troca
a lista e põe "no fim". A tela só manda `posicao` para produto novo, quando a pessoa mudou o lugar
ou quando mudou a categoria (editar o preço não desfaz a ordem que outra pessoa mudou).

A janela é o `<dialog class="janela">` de `../JanelaModal.tsx`: nenhuma regra `> *` pode zerar a
margem dele (use `> :not(dialog)`, PR 54).

Dados fictícios: `packages/dominio/src/semente.ts` cria alguns produtos inventados.
Testes de tela: `apps/gestao/testes-tela/produtos.spec.ts` e `adicionais.spec.ts` (tamanhos, grupos, prévia).
