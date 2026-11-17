# Telas de horários de venda e categorias (E07 parte 2, decisão 0016)

Guia curto para quem for mexer nestas telas depois (pessoa ou outro modelo). Leia antes de mudar.
A tela de Categorias fica em `../categorias/` e usa as peças desta pasta (grade de 7 dias, abas, dados).

## O que existe

- **Horários de venda** (`/cadastros/horarios`): faixa **Agora** (Loja e Delivery, atualiza a cada
  60 s), **Semana da loja** (7 dias: Aberta, Abre, Último pedido da cozinha, Fecha; copiar para os
  outros dias abertos), **Canais** (abas Loja | Delivery com a grade de 7 dias), **Datas especiais**
  (lista + janela "Nova data especial", cancelar com confirmação) e **Pausas** (lista + janela
  "Pausar agora", Retomar).
- **Categorias** (`/cadastros/categorias`): cartões com ordem, nome, descrição e a situação agora
  ("Loja: Vendendo agora"); nova e editar na janela; desativar com "Desfazer"; cada cartão abre o
  **horário da categoria** (a mesma grade de 7 dias, por canal; "Igual ao canal" = segue).

## A regra (não muda pela tela)

Três camadas, de fora para dentro; vale a interseção: **unidade** (abre até o último pedido da
cozinha) > **canal** (loja, delivery) > **categoria** em cada canal. A semana é o padrão; a data
especial troca um dia; a pausa tira de venda na hora. Quem decide "pode vender agora" é o banco
(`situacao_de_venda`, migração 0010). A tela só mostra a conta (`efetivoDoDia`) para ajudar.

## Mapa dos arquivos (um assunto por arquivo)

| Arquivo | Faz |
|---|---|
| `page.tsx` | Página (servidor): confere `cadastros.ver`. |
| `TelaDeHorarios.tsx` | Junta as seções; o aviso rápido. |
| `usarHorarios.tsx` | Único lugar que fala com `/api/horarios` (e lê as categorias). Recarrega a cada 60 s só `agora` e `pausas`. |
| `FaixaAgora.tsx` | Faixa "Agora" (selo verde ou cinza + `textoDaSituacao`). |
| `SemanaDaLoja.tsx` | Semana da loja (7 linhas), validação, copiar, Salvar semana. |
| `GradeDeVenda.tsx` | **Componente reutilizável** da grade de 7 dias de um canal ou de uma categoria. Mostra "Vale" (horário de fato). |
| `AbasDoCanal.tsx` | Abas Loja / Delivery (setas trocam). |
| `DatasEspeciais.tsx`, `JanelaDataEspecial.tsx` | Lista e janela de data especial. |
| `Pausas.tsx`, `JanelaPausa.tsx` | Lista e janela de pausa. |
| `contas.ts` | Funções puras (arrumar hora, validar, interseção, nomes, datas). Testes em `apps/gestao/testes/horarios-contas.teste.ts`. |
| `textos.ts` | TODOS os textos destas telas. Mude frases aqui (as de categoria ficam em `../categorias/textos.ts`). |
| `horarios.css` | Estilos (prefixo `hor-`), importado em `cadastros/layout.tsx`. |

## Contratos da API (já prontos no servidor)

- `GET /api/horarios` → `Horarios` (`podeMudar`, `semana`, `venda` só com os dias que não seguem, `datas`, `datasVenda`, `pausas`, `agora`).
- `POST /api/horarios/semana` `{ dias: [7 x { dia, aberta, abre, ultimoPedido, fecha }] }`
- `POST /api/horarios/venda` `{ canal, categoriaId | null, dias: [7 x { dia, modo, inicio, fim }] }`
- `POST /api/horarios/datas/unidade`, `/datas/venda`, `/datas/cancelar`, `/pausas`, `/pausas/retomar`.
- `GET/POST /api/cadastros/categorias` (`cadastros.gerenciar` para gravar; sem `descricao` mantém a que existe).
- Todas as de horário devolvem o `Horarios` inteiro atualizado; erro vem com a mensagem pronta (mostre-a).

## Regras que não podem mudar

1. **Permissões**: `cadastros.ver` vê; horários só com `podeMudar` (gerente geral, dono, administrador); categoria com `cadastros.gerenciar`. A tela só esconde botões; o servidor confere sempre.
2. **Ajuda em todo campo**: use `Campo`, `Selecao`, `AreaDeTexto`, `Grupo`/`OpcaoDoGrupo` e, dentro de uma grade, `CampoDoGrupo` (a grade inteira tem uma ajuda só). O teste `ajuda-nos-campos.spec.ts` falha se faltar.
3. **Hora em texto "HH:MM"** (não `type="time"`: ele não aceita "24:00", que é meia-noite no fim). `arrumarHora` aceita "11", "11h30", "1130".
4. **Sem " · "** em texto de tela; **nenhuma cor escrita** (só variáveis de `tema.css`); fundo claro.
5. **Nada se apaga**: data especial se cancela (desativa), pausa se retoma, categoria se desativa.
6. Celular (390 px): cada dia vira um cartão empilhado; alvo de toque de 44 px.

## Ideias para depois

- Mostrar no "Vale" de cada dia também a data especial da semana corrente.
- Editar uma data especial existente pela lista (hoje: criar de novo na mesma data troca a que existe).

## Como rodar os testes

```bash
pnpm exec vitest run apps/gestao/testes/horarios-contas.teste.ts   # funções puras
# Telas (banco próprio terminado em _teste; PORTA_TELA troca as portas 3100-3102):
DATABASE_URL_TELA=postgres://erp:erp@localhost:5432/<seu_banco>_teste PORTA_TELA=3400 \
  pnpm teste:tela --trace off horarios.spec.ts categorias.spec.ts ajuda-nos-campos.spec.ts
```
