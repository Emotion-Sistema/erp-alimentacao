# Frente: visual mais limpo (ideia nº 14)

Pedido do responsável em 25/11/2026: layout "completamente diferente, mais simples e funcional e
mais bonito", sem perder a identidade. Hoje acha poluído: letra grande, bordas, jeito de pôr a
informação. Referência dada: vídeo de PDV de restaurante (youtube.com/watch?v=Hcuksv6JzL0; só deu
para ver a miniatura: tema escuro, trilho de ícones à esquerda, 4 números no topo, cardápio em
fotos, comanda à direita).

## O que foi feito
- Fotos das telas atuais (lançador, Produtos, Estoque, Mapa de mesas) para comparar.
- Skill externa `interface-design` (dammyjay93, 34,8 mil instalações) baixada só na pasta temporária
  da sessão e usada como guia; **não** foi instalada no repositório.
- 3 protótipos clicáveis, mesma marca (Espuma e Brasa), mesmos dados fictícios, telas Início,
  Novo pedido e Produtos, no computador e no celular: `visual-limpo/prototipos.html`
  (artifact privado https://claude.ai/artifact/EQbaPod1viKPCjoQjPKZbL).
  - **A · Balcão** (linha do vídeo): trilho de ícones, 4 números do dia no topo, cardápio em fotos
    com "restam N"/"acabou" vindo do estoque, comanda à direita. Opção de ver escuro como no vídeo.
  - **B · Comanda**: sem menu lateral; abas finas no topo, busca geral Ctrl+K, títulos em Fraunces,
    listas com linha fina, cardápio com pontilhado e comanda que parece ticket de papel.
  - **C · Turno**: começa pelo "o que fazer agora" (cartão grande), linha do turno 7h–23h30 com a
    cozinha fechando às 23h, doca flutuante com 5 botões, alvos de toque grandes. Letra Figtree.
- Em todos: letra base 14–15 px (hoje 18), sem bordas grossas, separação por espaço e sombra leve.

## O que muda se for escolhido (avisar antes de construir)
- Escuro na gestão (A no modo escuro) revê a decisão 0012 (gestão sempre clara, pedido de 15/11).
- Letra menor revê a escolha de 18 px pela leitura no tablet; manter 16 px no tablet da cozinha.
- B e C trocam a navegação aprovada em 18/11 (0019, adendo: barra de baixo A/B).

## Escolha (25/11/2026)
- **O responsável escolheu o A (Balcão)** e pediu para melhorar e mostrar o cadastro de produtos e as
  fichas técnicas. Versão 2 do artifact: o A ganhou 6 telas funcionando, com dados fictícios:
  - **Produtos:** lista com filtro e busca; "Novo produto" ou toque na linha abre a gaveta lateral com
    foto, nome, descrição, categoria, lugar na lista (prévia, sem número de ordem), preço da loja e do
    delivery (vazio = igual), tamanhos com acréscimo e preço final, "passa pela cozinha" + tipo + tempo,
    grupos de adicionais, resumo da ficha e alergênicos vindos da ficha. Cada campo com explicação e
    "Ver exemplo", e "Mostrar todos os exemplos" (decisão 0012). Validação como na 0018/0021.
  - **Fichas técnicas:** lista com custo, custo sobre o preço (limite 35%), "dá para fazer" e quem limita,
    alergênicos e situação; ficha aberta com receita, edição que recalcula na hora, item sem quantidade
    vira pendência, "Gravar versão N+1".
  - **Produção** (RC-10): colunas por tipo de preparo (Chapa, Cozinha, Fritadeira, Cafeteria), relógio
    correndo, aviso de atraso, Começar/Pronto. **Estoque:** por área, em uso/guardado/total, nível e mínimo.
  - Escuro continua só como opção de ver; a gestão segue clara até decisão nova.
  - **Produção com cores fortes (pedido de 25/11/2026, versão 3):** o cartão inteiro fica na cor da etapa,
    com o nome escrito no topo e legenda na tela: Na fila = azul; Preparando = âmbar; Faltam N min =
    laranja com listras; Atrasado +N min = vermelho pulsando; Pronto = verde. Cor nunca sozinha:
    sempre nome e ícone. O cartão muda de cor sozinho quando o tempo passa.

## Versão 4 (25/11/2026), pedidos do responsável
- Produção: "Na fila há 0:12" e "Ficou pronto em 4:10" (rótulo antes do número; antes parecia invertido).
- **Tema claro ou escuro, cada pessoa escolhe** (botão sol/lua no topo). **Revê a decisão 0012**
  ("gestão sempre clara", 15/11): registrar decisão nova ao construir; a escolha fica guardada por usuário.
- Celular: no Início o topo (cabeçalho e números) rola junto, não fica travado.
- **Visão por cargo** ("Ver como"): menu e telas saem da matriz (`permissoes.ts`): dono/gerente 6 telas;
  supervisor 6 (estoque só salão/cafeteria, produtos e fichas só leitura, sem custo); caixa só Início
  (contas a receber e motoboys); atendente Início (minhas mesas, prontos para levar) + Novo pedido;
  cozinheira Início, Produção (opera), Estoque da cozinha, Produtos e Fichas (só leitura, sem custo);
  auxiliar vai direto para a Produção. Dono, gerente e supervisor veem a produção mas não tocam em
  Começar/Pronto (`producao.operar` é exclusiva da cozinha).
- **Regra nova do responsável (25/11/2026): valores do dia (vendas, ticket médio, gráfico de vendas)
  só de supervisor para cima**; caixa, atendente e cozinha nunca veem. Não existe na matriz: criar a
  ação `painel.valores` (dono, administrador, gerente geral, supervisor) com teste por tela e pela API,
  e deixar claro que não é financeiro (gerente geral e supervisor continuam sem `faturamento.ver`).

## Versão 5 (25/11/2026): tela Mesas
- Pedido do responsável: caixa e atendentes precisam saber quantas mesas estão livres e quais; contador
  de tempo do cliente em cada mesa (só a equipe vê, nunca o cliente); mapa bonito e organizado.
- Tela **Mesas** (caixa, atendente, supervisor, gerente, dono; regra: `caixa.operar` ou `pedidos.lancar`):
  mapa por área (Salão e Varanda, desenho de exemplo; o desenho real da loja falta), mesa com cadeiras
  conforme os lugares, cor + nome da situação (Livre verde, Ocupada café, Pedindo a conta âmbar),
  relógio "há 38 min / 1h12", avisos (pedido atrasado, pronto para levar, na cozinha), filtro e
  "7 livres de 16". Toque abre o painel: tempo desde que sentou, pessoas, atendente, pedido, conta até
  agora e ações (abrir mesa, lançar pedido, pediu a conta; **receber só o caixa**). No celular vira
  grade de 3 colunas. O Início do caixa e do atendente mostra "7 de 16 mesas livres" com atalho.

## Versão 6 (25/11/2026): mapa da loja de verdade
- O responsável mandou o esboço do salão. O mapa do protótipo agora segue o desenho: 60 Sabores e
  Cafeteria no topo, Área da TV (4 mesas + TV), Frente perto do caixa (7 mesas, com o Mesão), Bancada,
  Entrada pela calçada e Caixa. 11 mesas. Leitura e perguntas em `cerebro/empresa/mapa-das-mesas.md`.

## Versão 7 (25/11/2026): etapa de cada item na mesa
- Pedido do responsável: o atendente, ao tocar na mesa, vê em que passo está cada produto; o cliente
  também vê no app. **Já previsto** no RC-10 (seção 8) e no RC-20 (QR da mesa): não é ideia nova.
- Painel da mesa: cada item com a etapa da cozinha, nas mesmas cores da Produção (Na fila, Preparando,
  Faltam N min, Atrasado, Pronto, Entregue), mudando sozinha. Item pronto: botão "Entregue" só para o
  atendente (`pedidos.marcar_entregue`). "Ver como o cliente vê no app": linha Recebido → Na fila → Em
  preparo → Pronto → Entregue, previsão, etapa por item; sem "atrasado", sem tempo de mesa, sem nomes.

## Versão 9 (25/11/2026): mesa abre em janela
- Pedido do responsável: sem rolar a tela; tocar na mesa abre uma janela (popup) com tudo. Computador:
  janela no centro, cabe sem rolar (testado em 1440x900); com "ver como o cliente vê" ela alarga e mostra
  lado a lado. Celular: sobe de baixo (folha). Fecha no X, tocando fora ou com Esc. Botões lado a lado.
- Ideias novas já no protótipo: cliente chama o atendente pelo QR (mesa 10 pisca, "Estou indo"); "vagam em
  breve" no topo. Outras sugestões registradas em `cerebro/ideias-do-cliente.md` (seção Sugestões do Claude).

## Versão 10 (25/11/2026): ideias do salão aprovadas e envio do pedido
- "Enviar para a cozinha" agora volta para o mapa de mesas, com a mesa piscando; os itens viram tickets na
  Produção e aparecem na mesa com a etapa. (Antes só dava a mensagem: era o protótipo incompleto.)
- **O responsável aprovou as 6 sugestões** (25/11/2026), já no protótipo: dividir a conta (inteira, por
  pessoa com centavos distribuídos sem perder nada, por item); trocar de mesa; juntar mesas; lista de
  espera com mesa sugerida e aviso pelo app (sem SMS pago); alerta de mesa esquecida (ocupada há 10 min
  ou mais sem pedido); "mais uma rodada" das bebidas; card "Salão hoje" no Início de quem vê valores.

## Versão 11 (25/11/2026): tela cheia
- Botão "Abrir em tela cheia" (pedido do responsável): o protótipo ocupa a tela toda, no computador e no
  celular; sai pelo botão "Sair da tela cheia" ou Esc. No iPhone, que não tem tela cheia do navegador,
  ocupa a página inteira. No sistema real entra na casca (V1): botão no topo, útil no tablet da cozinha
  e no caixa.

## Parte 1 em andamento (25/11/2026, "ok" do responsável)
- Decisão 0028 (revê o item 5 da 0019 e o "sempre clara" da 0012). Casca nova: trilho de ícones claro
  (`apps/gestao/app/Menu.tsx`, ícones do catálogo; lançador usa `ICONE_DO_APP`), topo claro com
  aplicativo, pessoa · cargo, sino e conta em janela (`Casca.tsx`), letra 15 px na casca (tablet 18 px
  até a parte 4), tokens `--cor-brasa-suave` e `--cor-linha` em `tema.css` (contraste testado).
- Fotos antes/depois: `pnpm exec tsx scripts/comparar-telas.ts <antes> <depois> <saida.html>` sobre as
  fotos do `cascas.spec.ts` (`apps/gestao/test-results/telas`).
- Tokens do escuro ficaram para a parte 4, junto da escolha por pessoa (testar contraste com a troca).

## Parte 1 e "exatamente igual" feitos (25/11/2026)
- PR 150 (casca: trilho, topo claro) e PR 151 (acabamento único `balcao.css`, topo com nome da tela,
  relógio e cargo, Produtos igual ao protótipo, janela em gaveta, regra para toda aba nova: guia
  `docs/visual-balcao.md`, skill `tela-da-gestao`, CLAUDE.md, adendo 0028). Juntados na main.
- Abas novas no visual do protótipo (PR 152, juntado): Mesas, Novo pedido (cardápio real, comanda sem gravar,
  serviço 10% "a confirmar") e Produção (colunas vazias). Ligação com pedidos fica para a E13 (agenda).
- Falta (parte 3): Ingredientes, Estoque, Funcionários, Fichas e as demais no formato de lista do protótipo.

## Plano de implantação (aprovado com "ok" em 25/11/2026)
Nesta frente, em PRs pequenos, só sobre o que já existe:
1. **V1 · Decisão e casca:** registro de decisão novo (visual A; revê a 0012 "gestão sempre clara" e o
   tamanho de letra; tema claro/escuro escolhido pela pessoa). Tema (`tema.css`: letra 15 px, bordas leves,
   sombra suave, tokens do escuro) e casca da gestão (trilho de ícones, topo, barra de baixo no celular, botão de tela cheia).
   Testes de tela ajustados, fotos no PR, revisor (o menu nasce da matriz de permissões).
2. **V2 · Componentes:** lista/tabela limpa, gaveta lateral de cadastro, janela (popup), chips e botões.
3. **V3 · Telas que já existem, uma por PR:** Produtos, Fichas técnicas, Estoque, demais cadastros, avisos.
4. **V4 · Preferências por pessoa:** guardar claro/escuro **e letra normal ou grande** no usuário (migração
   pequena, skill migracao-segura); tablet da cozinha começa em letra grande.
**Acréscimos aprovados pelo responsável em 25/11/2026 ("todas"):** (a) busca geral no topo (Ctrl+K /
lupa no celular) para produtos, fichas, ingredientes e funcionários, só com o que o cargo pode ver
(parte V2); (b) letra normal/grande por pessoa (V4); (c) telas vazias, carregando e erro explicadas com
o próximo passo (V2 e V3); (d) fotos automáticas das telas antes e depois, comparadas a cada mudança,
para pegar quebra visual sem querer (V1). Decisão do responsável: **a troca do visual é feita nesta
frente**; não esperar o chat principal.
Fica para o **chat principal**, nas etapas do roteiro, usando o protótipo como referência: Novo pedido,
Produção (cores por etapa), Mesas e as 6 ideias do salão (E17), painel com valores do dia (ação nova
`painel.valores`, só supervisor para cima), visão do cliente (RC-10 seção 8, RC-20).

## Falta
- "Ok" do responsável para o plano de implantação.
- Responsável confirmar números, lugares e as dúvidas do mapa (`cerebro/empresa/mapa-das-mesas.md`).
- Mapa real: esboço recebido em 25/11/2026 (`cerebro/empresa/mapa-das-mesas.md`). Ao construir (E17), a
  gerência monta e muda o mapa na própria tela, sem programador.
- Depois: registro de decisão novo (casca do A, letra 14–15 px, trilho de ícones) e PRs do visual, tela
  a tela, com fotos das telas no PR. Rever o adendo de navegação no celular da 0019 (o A usa barra de baixo).
- Depois da escolha: registro de decisão novo, mudança no `tema.css` e na casca, tela a tela, com as
  fotos das telas no PR.

## Próximo passo (para o próximo chat)
Responsável deu "ok" (25/11/2026) para a parte 3: passar Ingredientes, Estoque, Funcionários e Fichas para o
formato de lista do protótipo (como Produtos: `balcao-barra`, `balcao-lista`, linhas `hor-cat`), uma tela por PR,
com a skill `tela-da-gestao` e fotos antes/depois (`scripts/comparar-telas.ts`). Não foi feito nesta sessão por
falta de orçamento de tokens.
- **Funcionários feito (25/11/2026):** chips Todos/Ativos/Desligados, busca, "Novo funcionário" na gaveta, tabela dentro de `balcao-lista` (no celular a lista some como moldura). 
- **Ingredientes feito (25/11/2026):** chips por área, busca, Importar e Adicionar na barra; itens (`ItemDeLista`) viram linhas dentro de `balcao-lista` (regras genéricas em `balcao.css`, valem para outras telas que usarem `ItemDeLista` dentro da lista). 
- **Estoque feito (25/11/2026):** área e "vence logo" em chips, busca na barra, itens em linhas dentro de `balcao-lista` (vale também para o salão). 
- **Fichas feito (25/11/2026):** tipo e situação em chips, busca na barra, lista num cartão só. **Parte 3 concluída.** Próxima: parte 4 (claro/escuro e letra por pessoa).


## Junção automática (25/11/2026)
O responsável criou a regra `main protegida` (testes obrigatórios: "Lint, tipos, testes e build" e "Ensaio da homologação (Docker)") e ligou "Allow auto-merge". Daqui em diante: abrir o PR e ligar a junção automática (squash); o GitHub junta sozinho quando os testes passam.
