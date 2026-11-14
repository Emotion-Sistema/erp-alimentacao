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
