# Telas do catálogo de embalagens (ideia nº 6)

Guia curto para quem for mexer nestas telas depois (pessoa ou outro modelo). Leia antes de mudar.

## O que existe

- **Aba Embalagens** (`/cadastros/embalagens`): catálogo por tipo em corredores recolhíveis,
  busca com realce, filtros em chips (tipo, fornecedor, medida) com contadores, painel para criar
  e editar, desativar com "Desfazer". Atalhos: `/` busca, `N` nova (só quem gerencia), `Esc` fecha.
- **Bloco "Embalagens de compra (opcional)"** no ingrediente (novo, existente, cadastro rápido e
  lista colada): recolhido por padrão, "Escolher do catálogo" (várias de uma vez) e "Criar nova
  embalagem" (o mesmo painel da aba).

## Mapa dos arquivos (um assunto por arquivo)

| Arquivo | Faz |
|---|---|
| `page.tsx` | Página da aba (servidor): confere `cadastros.ver` e passa `podeGerenciar`. |
| `CatalogoDeEmbalagens.tsx` | A aba inteira: estado da busca, filtros, corredores, painel, aviso, atalhos. |
| `FiltrosDoCatalogo.tsx` | Chips de filtro com contador. |
| `CorredorDoTipo.tsx` | Corredor recolhível ("Sacos (5)"). |
| `CartaoDoModelo.tsx` | Cartão de um modelo (também é a prévia do painel). |
| `PainelDoModelo.tsx` | Painel lateral / folha de baixo (`<dialog>` em portal, com o próprio `<form>`). |
| `AvisoComDesfazer.tsx` | Aviso que some sozinho, com "Desfazer" (`role="status"`). |
| `Realce.tsx` | Marca o trecho buscado. |
| `EmbalagensDoIngrediente.tsx` | Bloco do ingrediente, modos `local` e `servidor`. |
| `ResumoRecolhido.tsx` | Cabeça do bloco com o resumo e Mostrar/Esconder. |
| `CartaoDaColocada.tsx` | Uma embalagem já no ingrediente (conta ou campo de quantidade). |
| `EscolhaDoCatalogo.tsx` | Escolher do catálogo: sugestões, busca, tipo, várias, conta ao vivo. |
| `usarCatalogo.tsx` | Único lugar que fala com `/api/cadastros/embalagens`; provedor compartilhado. |
| `contas.ts` | Funções puras (conta, nomes, filtros, sugestões). Testes em `apps/gestao/testes/embalagens-contas.teste.ts`. |
| `textos.ts` | TODOS os textos da tela. Mude frases aqui. |
| `embalagens.css` | Estilos (prefixo `emb-`), importado em `cadastros/layout.tsx`. |

## Contratos da API (não mudam pela tela)

- `GET /api/cadastros/embalagens` → `ModeloDeEmbalagem[]` `{ id, tipo, tamanho ("25", "2.5" ou null), unidade, nome ("saco 25 kg"), fornecedorId, fornecedor, ativo, emUso }`.
- `POST /api/cadastros/embalagens` `{ id?, tipo, tamanho?, unidade?, fornecedorId?, ativo? }`: sem `id` cria; com `id` altera (sem `ativo`, fica como está). Em uso: tipo e tamanho não mudam (o servidor recusa e explica).
- `POST /api/cadastros/ingredientes/{id}/conversoes`:
  - do catálogo (só criar): `{ modeloId, quantidadeBase? }`; mesma família faz a conta no servidor; outra família ou sem tamanho exige `quantidadeBase`.
  - forma antiga (alterar, desativar, reativar, corrigir quantidade): `{ id, nome, quantidadeBase, ativo }`. Nunca mande `id` junto de `modeloId`.
- Ingrediente novo e cadastro rápido gravam pelo lote `POST /api/cadastros/ingredientes/lote` com `embalagens: [{ nome, quantidadeBase }]` (tudo ou nada). O lote ainda não guarda `modeloId`.

## Regras que não podem mudar

1. **Conta exata**: quantidade é texto decimal; conta com `multiplicarDecimal` (BigInt, 4 casas), igual ao servidor. Nunca `Number`, `parseFloat` ou float.
2. **Ajuda em todo campo**: use `Campo`, `Selecao`, `Marcador`, `Grupo`/`OpcaoDoGrupo` de `app/Campo.tsx` (explicação + "Ver exemplo"). O teste `ajuda-nos-campos.spec.ts` falha se faltar.
3. **Sem " · "** em texto de tela (teste `sem-resumo-corrido`). Dado com rótulo vai em selo, ficha ou chip.
4. **Fundo claro e nenhuma cor escrita**: só variáveis de `packages/interface/src/tema.css` (teste `sem-cor-fixa`).
5. **Permissões**: `cadastros.ver` vê; `cadastros.gerenciar` muda. A tela só esconde botões; o servidor confere sempre.
6. **Nada se apaga**: desativar, nunca excluir.
7. Acessibilidade: alvo de toque de 44 px, foco visível e devolvido a quem abriu, `aria-expanded` nos recolhíveis, `prefers-reduced-motion` respeitado. Sem estouro em 390, 768 e 1280 px.

## Como rodar os testes

```bash
pnpm exec vitest run apps/gestao/testes/embalagens-contas.teste.ts   # funções puras
pnpm verificar                                                       # lint, tipos e todos os testes
# Telas (banco próprio terminado em _teste):
DATABASE_URL_TELA=postgres://erp:erp@localhost:5432/<seu_banco>_teste \
  pnpm teste:tela embalagens.spec.ts cadastros.spec.ts cadastro-rapido.spec.ts ajuda-nos-campos.spec.ts visual-resumos.spec.ts
# Capturas (opcional): CAPTURAS_EMBALAGENS=<pasta> pnpm teste:tela embalagens.spec.ts
```
