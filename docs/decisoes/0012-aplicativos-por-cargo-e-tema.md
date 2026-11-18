# 0012: aplicativos por cargo, lançador e tema neutro

- Data: 14/11/2026
- Status: aceita (E04)
- Assunto da sessão: E04, base visual e cascas
- Complementa: RC-03, decisão 0011

## Contexto
O RC-03 pede um aplicativo por função (nome, endereço, atalho de instalação e tela inicial
próprios) sobre um núcleo único. A identidade visual ainda não chegou: tudo precisa
funcionar com um tema neutro, trocando só valores quando a marca vier.

## Decisão
1. **Catálogo único** em `packages/dominio/src/aplicativos.ts`: Caixa, Atendimento, Produção,
   Estoque e compras, Gestão, Financeiro e Entregas. Cada item de menu é ligado a **uma ação
   da matriz** (0011). O aplicativo aparece quando o cargo ativo pode ver pelo menos um item.
2. **O menu só esconde.** Cada tela confere no servidor a ação do item e mostra a recusa
   sem o conteúdo. Cada ação de verdade continua com `exigir(acao)` na rota.
3. **Lançador:** a tela inicial mostra os aplicativos do cargo ativo; quem tem só um vai
   direto para ele (caixa cai no Caixa, atendente no Atendimento).
4. **Quem vê o quê** (testado em `aplicativos.teste.ts` e pela tela):

| Cargo | Aplicativos |
|---|---|
| Dono, administrador | Caixa, Atendimento, Produção, Estoque, Gestão, Financeiro |
| Gerente geral, supervisor | Caixa, Atendimento, Produção, Estoque, Gestão (sem Financeiro) |
| Financeiro | Estoque (só materiais e custos), Financeiro |
| Atendente | Atendimento |
| Caixa | Caixa |
| Cozinheira | Produção, Estoque (cozinha) |
| Auxiliar de cozinha | Produção |
| Motoboy | Entregas |
| Contador externo | Financeiro (só pacote contábil) |

   Dono e gerente veem o Caixa só com o mapa de mesas e os motoboys: abrir caixa e receber
   são exclusivos do cargo de caixa ativo (0011).
5. **Tema:** cores só em `packages/interface/src/tema.css` (e o espelho `cores.ts` para o
   atalho de instalação). Um teste falha se aparecer cor fixa em outro arquivo.
6. **Atalho de instalação por aplicativo** (manifesto e ícone próprios). Funcionamento sem
   internet (service worker) fica para quando houver tela que precise dele.
7. **Telas futuras** conferem a ação antes de buscar qualquer dado (sair cedo com a recusa),
   não só dentro da casca.
8. **Avisos:** hoje a lista de avisos fica no lançador; quem tem um aplicativo só vai direto
   para ele e não a vê. Hoje nenhum aviso vai para esses cargos. **A E05 coloca os avisos
   dentro da casca de todo aplicativo.**
9. Manifesto e ícone são públicos (respostas fixas, em cache, sem dado interno); entram no
   limite de requisições junto com o resto na E06.

## Alternativas descartadas
- Um projeto Next por aplicativo: mais builds e publicações sem ganho agora; o núcleo e a
  sessão são os mesmos.
- Menu montado à mão em cada tela: fácil de esquecer um cargo; o catálogo é testado.

## Consequências
Tela nova de qualquer etapa entra como item do catálogo, com a ação da matriz. O atalho na
tela inicial do Android precisa ser conferido em aparelho real (homologação, E06).

## Critério de aceite e evidência
Teste do catálogo por cargo; testes de tela de cada aplicativo em celular (390x844), tablet
(1280x800) e computador (1440x900), sem a página ficar mais larga que a tela; recusas pela tela.

## Ajuda em cada campo (15/11/2026)
Pedido do responsável: embaixo de cada campo de digitar ou escolher, uma explicação com
exemplo rápido, que dá para mostrar ou esconder. Vale para o sistema inteiro.
- Componente único em `apps/gestao/app/Campo.tsx` (`Campo`, `Selecao`, `AreaDeTexto`,
  `Marcador`, `Grupo` + `OpcaoDoGrupo`). Cada campo tem: uma linha de EXPLICAÇÃO sempre visível
  (ligada ao campo por `aria-describedby`) e um botão "Ver exemplo" / "Esconder exemplo"
  (`aria-expanded`, `aria-controls`, alvo de toque de 44 px ou mais) que abre e fecha o EXEMPLO.
  `explicacao` e `exemplo` são obrigatórios nas propriedades: campo sem ajuda nem compila.
- `BotaoExemplos` no topo de toda tela com formulário: "Mostrar todos os exemplos" / "Esconder
  todos os exemplos". A escolha fica guardada por aparelho (`localStorage`, dentro de try/catch;
  se falhar, funciona sem guardar). Depois dela, um toque individual continua possível.
- Texto em português simples, exemplos inventados (ex.: `maria.silva`), nunca dado real de pessoa.
- Campo novo em qualquer tela interna usa esse componente, nunca `<input>`, `<select>` ou
  `<textarea>` soltos. Os apps `loja` e `site` seguirão o mesmo padrão quando tiverem formulários.
- Evidência: `apps/gestao/testes-tela/ajuda-nos-campos.spec.ts` percorre as telas com formulário e
  FALHA se algum campo visível ficar sem explicação ligada ou sem botão de exemplo; também testa
  abrir/fechar, "todos", persistência ao recarregar e o funcionamento sem armazenamento.

## Adendo de 15/11/2026: fundo sempre claro e resumos organizados
- **Fundo sempre claro (pedido do responsável, 15/11/2026).** O tema não tem mais modo escuro,
  nem automático (`prefers-color-scheme`) nem manual. `color-scheme: light` no `:root` e no `html`
  deixa os controles nativos claros também. Vale para a gestão, a loja e o site (tema compartilhado).
  Teste de tela emula o modo escuro do aparelho e confere o fundo claro.
- **Resumos organizados.** Texto corrido separado por pontos (g · área · embalagem) saiu do sistema.
  Padrão em `packages/interface`: `FichaDeDados`/`Dado`, `Selo` (inclui uma cor por área de estoque),
  `Icone`, `ChipDeEmbalagem`, `ItemDeLista`, `Faixa`, `ListaComIcone`, `BlocoDeConfirmacao`, `Citacao`.
  Números em formato brasileiro (texto/BigInt). Contraste AA dos pares de cores é testado.
  Um teste (`apps/gestao/testes/sem-resumo-corrido.teste.ts`) falha se o ponto do meio voltar a uma tela.

## Adendo de 18/11/2026: mostrar o que já existe, sem número de ordem
Pedido do responsável ao ver o campo "Ordem na lista" (não ficava claro o que era 10, 20, 30):
1. **Campo que depende do que já está cadastrado mostra a lista do que já existe**, para a
   pessoa comparar antes de gravar.
2. **Nada de número de ordem para digitar.** A pessoa escolhe a posição ("1º: no começo",
   "2º: depois de X") vendo a prévia de como a lista vai ficar; o servidor renumera a ordem
   dos ativos de 10 em 10 (`packages/dominio/src/posicao.ts`, com trava e auditoria).
   Componente: `apps/gestao/app/cadastros/PosicaoNaLista.tsx` (Categorias e Tipos de produção;
   usar o mesmo nos próximos cadastros com ordem, como Produtos).
