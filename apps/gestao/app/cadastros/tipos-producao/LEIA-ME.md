# Tela de Tipos de produção

Regra e motivo: `docs/decisoes/0017-tipos-de-producao.md`. Regra no servidor:
`packages/dominio/src/tipos-producao.ts`; constantes que a tela usa (sem banco):
`@erp/dominio/tipos-producao` (`tipos-producao-comum.ts`). Componente cliente nunca importa
`@erp/dominio` raiz.

| Arquivo | Faz |
|---|---|
| `page.tsx` | Página (servidor): confere `cadastros.ver` e passa `podeGerenciar` (`cadastros.gerenciar`). |
| `ListaDeTipos.tsx` | Lista por área (Cozinha, Cafeteria, com a frase de saída), desativados no fim; novo, editar, desativar com "Desfazer". |
| `CartaoDoTipo.tsx` | Um cartão: nome, área, "Faz N ao mesmo tempo", Editar e Desativar/Reativar. |
| `JanelaDoTipo.tsx` | Janela de novo ou editar (nome, área, capacidade, posição na lista com `../PosicaoNaLista.tsx`). |
| `textos.ts` | Textos desta tela. |

API: `GET /api/cadastros/tipos-producao` (lista, `cadastros.ver`) e `POST` (sem `id` cria, com `id`
altera; `nome` e `area` obrigatórios; `capacidade` 1 a 50, `posicao` (1 = primeiro; o servidor renumera de 10 em 10), `ordem` e `ativo` opcionais;
`cadastros.gerenciar`). Erro volta como `{ mensagem }`, igual às categorias.

O estilo vem de `../horarios/horarios.css` (`hor-tela`, `hor-secao`, `hor-cat`, `hor-escolha`).
A janela é o `<dialog class="janela">` de `../JanelaModal.tsx`: nenhuma regra `> *` pode zerar a
margem dele (use `> :not(dialog)`, PR 54).

Teste de tela: `apps/gestao/testes-tela/tipos-producao.spec.ts`.
