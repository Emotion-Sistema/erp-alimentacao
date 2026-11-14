# 0013: central de avisos, por cargo e turno

- Data: 14/11/2026
- Status: aceita (E05); hipóteses respondidas em 14/11/2026 (item 9), turnos revistos (item 1)
- Assunto da sessão: E05, avisos
- Complementa: RC-18, decisões 0011 e 0012

## Contexto
O RC-18 pede dois canais (aviso no aparelho e central interna) e que o aviso chegue ao
cargo e ao turno certos; quem está fora do turno não recebe aviso operacional. Ainda não
existe escala de turnos por pessoa no sistema.

## Decisão
1. **Turnos da equipe** (resposta do responsável, 14/11/2026): **Turno 1, 08h às 15h30;
   Turno 2, 15h30 às 23h30** (tabela `turno`, migração 0005, hora local da unidade; turnos
   não podem se sobrepor). É o horário de quem trabalha; a loja abre 9h ou 10h e fecha
   23h30. **Cada pessoa tem o próprio login, mesmo no celular dividido: no fim do turno ela
   sai e a próxima entra** (responsável).
   - A pessoa é do **turno em andamento quando ela entrou** (15h10 é Turno 1; ninguém é
     contado como "chegou mais cedo"). Quem entra antes do primeiro turno do dia, até 1 h
     antes (ex.: 07h40), é desse turno.
   - **Margem de troca de turno: 30 min** (sugestão, por unidade, `margem_troca_turno`).
     Depois do fim do turno, quem sai ainda recebe avisos por 30 min (15h30-16h,
     23h30-0h) e os avisos do turno valem até o fim da margem, então quem chega também
     recebe. Nenhum aviso cai no vão da troca.
   - Passada a margem, a pessoa para de receber e o sino pede para ela sair.
   - **Imprevisto:** "Continuo no <turno>" (pedido do responsável) pede a **senha da própria
     pessoa** (é uma nova entrada, com as travas do login; a sessão antiga é encerrada),
     para quem pegou o celular com a sessão de outra pessoa não continuar no nome dela.
     Só é aceito (no servidor) quando o turno da pessoa acabou. A sessão nova **nunca vai
     além da antiga** (herda o vencimento e o segundo fator): o código do autenticador do
     dono e do administrador não se renova só com a senha. Vale até o fim do turno em
     andamento mais a margem. Fica na auditoria.
   - **Gerentes mudam a margem quando quiserem** (pedido do responsável): tela Gestão →
     Turnos, 0 a 120 min, ação nova `horarios.gerenciar` (dono, administrador, gerente
     geral; a mesma regra dos horários). Cada mudança fica na auditoria com o antes e o depois.
     A margem nova vale na hora para quem está no turno e para os avisos criados depois dela
     (a validade de cada aviso é gravada quando ele nasce).
   - Consequência aceita da regra "15h10 é Turno 1": quem do Turno 2 entra antes das 15h30
     para de receber às 16h, se não tocar em "Continuo"; o certo é entrar na hora do turno.
   - Sem sessão, não recebe nada. A tela para mudar turnos e margem vem com os horários
     (E07/E12); aí trocar o gatilho de sobreposição por restrição de exclusão.
   - O fim do turno da equipe (23h30) é diferente da saída do tablet da cozinha (00h30, 0003).
2. **Dois tipos de aviso** (`aviso.natureza`):
   - **operacional**: nasce de um fato do sistema (ex.: código bloqueado). Vale **até o fim
     do turno em que nasceu mais a margem** (16h ou 0h): quem está chegando também recebe.
     Nascido fora de turno, vale só a margem (30 min);
   - **comunicado**: recado da gerência para um ou mais cargos, com **confirmação de
     leitura** ("Li e entendi"). Fica até cada um confirmar, ou só no turno de hoje, se
     quem mandou escolheu "só neste turno". O "até confirmar" vale para quem já tinha o cargo
     quando ele foi enviado: funcionário novo não recebe os comunicados antigos.
3. **Quem recebe:** o cargo **ativo** da pessoa precisa estar entre os cargos do aviso, na
   mesma unidade. Quem tem dois cargos só vê, em cada momento, os avisos do cargo com que
   está agindo, e só marca como visto ou resolvido o que vê na caixa daquele cargo. O
   aviso pode ainda ser para **uma pessoa só** (`para_usuario_id`).
4. **Entrega quando a pessoa abre o aplicativo** e a cada consulta (a tela consulta a cada
   15 s). Cada pessoa recebe cada aviso uma vez (chave primária; testado com 12 consultas
   ao mesmo tempo).
5. **Situação por pessoa:** novo, visto (apareceu na tela), resolvido. No comunicado,
   resolvido = leitura confirmada. A situação só anda para a frente e nada é apagado: o
   banco recusa voltar atrás, mudar a data ou apagar (RC-17).
6. **Comunicados:** só dono, administrador e gerente geral enviam e veem quem leu (ação
   nova `comunicados.enviar`). A lista mostra cada pessoa: confirmou, viu, recebeu e não
   abriu, ou ainda não entrou no turno. Quem recebeu e depois perdeu o cargo continua na lista.
7. **Aviso no aparelho (básico):** com o aplicativo aberto (mesmo em outra aba ou com a
   tela em outro aplicativo, enquanto o navegador estiver rodando), bipe, vibração e
   notificação do sistema, se a pessoa permitiu. O service worker só abre o aplicativo ao
   tocar na notificação; não guarda nada.
   A notificação mostra só "Abra o aplicativo para ver" (outros podem ver a tela
   bloqueada); o texto fica dentro do aplicativo. A consulta que entrega avisos recusa
   pedido vindo de outro site.
8. **A central fica dentro da casca de todo aplicativo** (cumpre o item 8 da decisão 0012):
   sino com o número de avisos novos, painel e a página `/avisos` com o histórico em
   páginas de 50 ("Ver mais avisos").

## Fica para depois (com etapa)
- **Aviso com o aplicativo fechado** (Web Push): precisa de chave guardada no cofre e do
  servidor no ar; entra com a homologação (E06) e é conferido em Android real.
- **Urgente não visto sobe para o superior** e **agrupar avisos**: precisam do worker com
  fila; entram quando houver avisos urgentes de verdade (pedidos e estoque, E09/E13/E14).
- **Mensagens do pedido, recados entre setores, passagem de turno, pedidos de
  autorização, horário de silêncio:** com as telas que usam cada um (E13 a E18).
- **Avisos na tela da estação da cozinha** (tablet compartilhado): com as telas de
  produção (E14).

## Alternativas descartadas
- Entregar no momento em que o aviso nasce, para quem está logado: perde quem entra no
  meio do turno. Entregar na abertura cobre os dois casos.
- Conexão permanente (SSE/WebSocket) já agora: mais peças no servidor; 15 s basta para os
  avisos de hoje. Revisar quando chegarem pedido pronto e pedido novo (E13/E14).

## Hipóteses respondidas (14/11/2026)
9. (a) Há dois turnos com nome: Turno 1 (08h-15h30) e Turno 2 (15h30-23h30); a loja abre e
   fecha no horário já combinado. (b) Ninguém começa a trabalhar de madrugada. (c) Só dono,
   administrador e gerente geral mandam comunicados: confirmado.

## Critério de aceite e evidência
`packages/dominio/testes/avisos.teste.ts` contra PostgreSQL (turnos com horas fixas no fuso de
São Paulo; nos bancos de teste os turnos cobrem o dia todo, para não depender da hora): cargo certo e nenhum outro,
cargo ativo, outra unidade, validade até o fim do turno, quem entra depois do fim do turno
não recebe, aviso para uma pessoa, recusas sem sessão ou com segundo fator pendente,
entrega concorrente sem duplicar, situação só para a frente, banco recusa apagar,
comunicado só pela gerência, quem leu e quem não leu, entrega de verdade fora de turno,
"Continuo no turno", comunicado "só neste turno" recusado fora de turno. Conferido quebrando
a regra de propósito: os testes falham. Testes de tela em `avisos.spec.ts`
nos 3 tamanhos.
