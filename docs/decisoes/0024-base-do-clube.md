# 0024: base do Clube E-MOTION na gestão

- Data: 19/11/2026
- Status: aceita
- Assunto da sessão: passo 4 do plano de 19/11/2026 (base do Clube na gestão)

## Contexto
O responsável pediu o aplicativo do cliente com um Clube de benefícios (ideia nº 12, RC-21). A conta
do cliente chega com o delivery próprio (E26) e o Clube funcionando logo depois; o plano de 19/11
antecipou a **base na gestão** para a equipe já deixar as regras prontas. Ainda faltam as respostas
do responsável sobre o percentual, os pontos e os prêmios: por isso **tudo é editável** e nada fica
fixo no código.

## Decisão
1. **Só regras, nenhum dado de cliente** (migração 0018). Tabelas: `clube_regras` (uma linha),
   `clube_categoria`, `clube_horario_desconto`, `clube_premio`, `clube_presente`, `clube_campanha`.
   O Clube nasce **desligado**.
2. **Desconto do aplicativo:** percentual em pontos-base (1000 = 10,00%, máximo 50%), em todas as
   categorias ou só nas marcadas, teto por pedido em centavos (vazio = sem teto) e horário por dia
   da semana (todo o horário de venda, sem desconto, ou uma janela; início vale, fim não). Regra
   única `descontoDoClube` (em `clube-comum`): arredonda **para baixo**, nunca passa do teto. O pedido
   (E26 e depois) relê as regras do banco (`regrasDoClube`) e chama a mesma função no servidor;
   lá também se aplica "não acumula, vale o maior" (cupom, promoção, desconto de funcionário).
3. **Pontos:** pontos por real pago (0 a 100), só reais inteiros contam (`pontosDoPagamento`);
   Clube desligado não dá pontos. O saldo e o movimento compensatório no cancelamento entram com a
   conta do cliente.
4. **Prêmios:** catálogo com nome, pontos, descrição e produto opcional (ativo). Nada se apaga:
   prêmio que sai fica inativo; o nome só se repete entre inativos.
5. **Presentes automáticos:** boas-vindas, aniversário e "sentimos sua falta" (7 a 365 dias sem
   pedir), cada um ligado ou desligado, com um benefício: desconto em % (até 100%), desconto em R$,
   produto grátis (produto ativo) ou pontos; validade de 1 a 90 dias e mensagem curta.
6. **Campanhas** (só notificação do aplicativo, RC-21): a equipe agenda título, texto (até 180),
   público e dia e hora **na hora local da loja**. O servidor confere, sob trava: pelo menos 5 minutos
   à frente e no máximo 90 dias; **casa aberta** naquele instante (`unidade_aberta_em`, mesma tabela
   dos horários; data especial vence o dia da semana; abre ≤ hora < fecha); e **limite por semana**
   (segunda a domingo, padrão 2, editável de 1 a 7), contando agendadas e enviadas. Agendada pode
   mudar ou ser cancelada com motivo; nada se apaga. **Nada é enviado nesta etapa**: o envio (só para
   quem aceitou ofertas) entra com o aplicativo do cliente.
7. **Permissões** (decisão 0011): `clube.ver` e `clube.gerenciar` para dono, administrador e
   gerente geral ("definidos pelo gerente", RC-21). Auditoria com antes e depois em tudo.
8. **Concorrência:** regras com `FOR UPDATE`; agendar campanha pega a trava das campanhas e lê o
   limite com `FOR SHARE` (espera quem está mudando o limite); produto e categoria escolhidos são
   lidos com `FOR SHARE`. Dois testes determinísticos com duas conexões, verificados por mutação.

## Hipóteses (reversíveis; a confirmar com o responsável)
- Valores iniciais: desconto 10%, todas as categorias, sem teto, 1 ponto por real, 2 campanhas por
  semana, presentes desligados (10%, 15% e 10% depois de 30 dias). Todos editáveis na tela.
- Quem configura: dono, administrador e gerente geral (supervisor não).
- Arredondamento do desconto para baixo, sobre a soma dos itens que participam.
- Semana da campanha de segunda a domingo; campanha conta pelo horário da loja escolhida.
- Níveis (Bronze, Prata, Ouro) e "indique um amigo" ficam para depois, com dados reais (RC-21).

## Alternativas descartadas
- Percentual como número decimal: risco de arredondamento; pontos-base são inteiros exatos.
- Guardar campanha já com a lista de clientes: ainda não há clientes; o público é calculado no envio.
- Valores fixos no código até o responsável responder: obrigaria um PR a cada ajuste.

## Critério de aceite e evidência
`packages/dominio/testes/clube.teste.ts` (PostgreSQL real): desconto e pontos (arredondamento, teto,
categorias, horário, entrada inválida); permissões por cargo com a recusa na auditoria; regras
(campo ausente fica, teto nulo, categorias desativadas e de volta, horários); prêmios; presentes;
campanhas (casa fechada, data especial, prazo, data inexistente, limite por semana, editar,
cancelar); duas provas de concorrência. Matriz da API com as 6 rotas novas. Testes de tela do Clube.
