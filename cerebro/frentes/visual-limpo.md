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

## Falta
- Responsável testar a versão 5 e dizer o que ajustar.
- **Desenho real do salão** (quantas mesas, lugares de cada uma, áreas): pedir ao responsável quando o
  mapa de mesas for construído (E17); a tela deve permitir montar o mapa sem programador.
- Depois: registro de decisão novo (casca do A, letra 14–15 px, trilho de ícones) e PRs do visual, tela
  a tela, com fotos das telas no PR. Rever o adendo de navegação no celular da 0019 (o A usa barra de baixo).
- Depois da escolha: registro de decisão novo, mudança no `tema.css` e na casca, tela a tela, com as
  fotos das telas no PR.
