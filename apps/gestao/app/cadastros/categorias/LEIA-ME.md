# Tela de Categorias

O guia completo (regra, mapa dos arquivos, contratos da API, testes) está em
`../horarios/LEIA-ME.md`: as duas telas dividem a grade de 7 dias, as abas e os dados.

| Arquivo | Faz |
|---|---|
| `page.tsx` | Página (servidor): confere `cadastros.ver` e passa `podeGerenciar` (`cadastros.gerenciar`). |
| `ListaDeCategorias.tsx` | Lista (ativas e desativadas), nova, editar, desativar com "Desfazer". |
| `CartaoDaCategoria.tsx` | Um cartão: posição no cardápio (1ª, 2ª...), nome, descrição, situação agora e o horário da categoria (`GradeDeVenda`). |
| `JanelaDaCategoria.tsx` | Janela de nova ou editar (nome, descrição, posição na lista com `../PosicaoNaLista.tsx`). |
| `textos.ts` | Textos desta tela. |
