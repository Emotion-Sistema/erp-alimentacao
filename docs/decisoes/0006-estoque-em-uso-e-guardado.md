# 0006: estoque em uso e guardado, e disponibilidade automática

- Data: 13/11/2026
- Status: aceita (definição do responsável). Substitui a 0001.
- Assunto da sessão: estoque

## Contexto
A 0001 deixava em aberto o significado de "guardado". O responsável definiu: há o estoque
disponível para uso imediato e o estoque guardado, usado depois que o primeiro acaba. O
que se pode vender deve refletir o estoque automaticamente, em todos os canais, e o
responsável pelo estoque deve ser avisado, com uma linha saudável e uma de emergência.

## Decisão
1. Dois locais por ingrediente: **em uso** e **guardado**. O consumo sai do em uso; se
   faltar, o sistema transfere do guardado automaticamente e consome.
2. Para evitar confusão com a palavra "disponível", o saldo calculado passa a se chamar
   **livre para venda**: L = F - B - R, em que F é o físico total (em uso + guardado),
   B o bloqueado e R o reservado.
3. A disponibilidade de cada produto para venda é calculada a partir das fichas técnicas
   e do livre para venda, e vale para comanda virtual, loja online e aplicativo.
4. Canal online é rígido e pode ter margem de segurança; loja física aceita autorização
   de supervisor com contagem obrigatória depois.
5. Cada ingrediente tem linha saudável e linha de emergência sobre o total, e nível de
   abastecimento sobre o em uso. O sistema sugere as linhas pelo consumo; a pessoa decide.
6. Notificações ao responsável pelo estoque: uma por cruzamento de linha, com escalada
   ao gestor para o que for urgente e não lido.

## Confirmações do responsável (13/11/2026)
- O guardado conta para a venda: a venda continua, e o responsável pelas compras recebe
  mensagem urgente quando o guardado começa a ser usado.
- Loja física com autorização de supervisor e contagem depois; delivery rígido: confirmado.

## Alternativas descartadas
- Vender só o que está em uso: obrigaria alguém a lançar transferência antes de cada
  venda, o contrário do pedido.
- Compra automática ao cruzar a linha: compra envolve dinheiro e fica com pessoa.

## Consequências
A baixa do RC-01 passa a escolher o local. O cálculo de disponibilidade precisa ser
rápido (é consultado em toda tela de venda). O estoque teórico precisa de contagens
frequentes para merecer confiança, daí a contagem rápida guiada.

## Critério de aceite e evidência
Critérios de `requisitos/RC-09-estoque-inteligente.md` e exemplos do RC-01.
