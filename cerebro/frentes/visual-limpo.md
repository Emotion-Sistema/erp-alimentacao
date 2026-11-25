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

## Falta
- Escolha do responsável (pode misturar: ex. casca do C com cardápio do B).
- Depois da escolha: registro de decisão novo, mudança no `tema.css` e na casca, tela a tela, com as
  fotos das telas no PR.
