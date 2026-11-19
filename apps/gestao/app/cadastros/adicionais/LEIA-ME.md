# Tela de Adicionais

Regra e motivo: `docs/decisoes/0021-precos-tamanhos-adicionais.md`. Regra no servidor:
`packages/dominio/src/adicionais.ts`; o que a tela usa (sem banco): `@erp/dominio/produtos`
(`produtos-comum.ts`: tipos `GrupoDeAdicionais` e `Adicional`, `centavosDoTexto`, limites).
Componente cliente nunca importa `@erp/dominio` raiz.

| Arquivo | Faz |
|---|---|
| `page.tsx` | Página (servidor): confere `cadastros.ver` e passa `podeGerenciar` (`cadastros.gerenciar`). |
| `ListaDeGrupos.tsx` | Grupos em uso (por nome) e, num bloco "Fora de uso", os desativados; novo, editar, desativar com "Desfazer". Conta em quantos produtos ativos cada grupo é usado (pela lista de produtos). |
| `CartaoDoGrupo.tsx` | Um cartão: nome, regra ("Opcional, até 3", "Obrigatório: escolha 1", "Escolha de 2 a 4"), itens com preço ("grátis" quando 0), uso, Editar e Desativar/Reativar. |
| `JanelaDoGrupo.tsx` | Janela de novo ou editar: nome, "Escolha obrigatória?" (mínimo só se marcada), máximo, itens (nome, preço, preço no delivery opcional, vezes por item) com subir, descer e remover. |
| `textos.ts` | Textos desta tela e `regraDoGrupo` (também usado na janela do produto). |
| `adicionais.css` | O pouco que é só desta tela e das listas editáveis (`linha-editavel`), também usadas na janela do produto. |

A tela lê `GET /api/cadastros/adicionais` e `GET /api/cadastros/produtos` (`cadastros.ver`). Grava em
`POST /api/cadastros/adicionais` (`cadastros.gerenciar`): sem `id` cria, com `id` altera. `itens` vai
sempre com a lista COMPLETA, na ordem, com o `id` dos que já existiam: o que não vier fica inativo.
`precoDeliveryCentavos: null` = igual ao da loja. Desativar manda só `{ id, ativo }`. Erro volta como
`{ mensagem }` e aparece na janela.

Quem liga um grupo a um produto é a janela do produto (`../produtos/JanelaDoProduto.tsx`).
Botões das linhas (subir, descer, remover): `../BotoesDaLinha.tsx`.
Teste de tela: `apps/gestao/testes-tela/adicionais.spec.ts`.
