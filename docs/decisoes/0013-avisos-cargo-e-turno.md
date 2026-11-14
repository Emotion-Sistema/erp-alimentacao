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
   Turno 2, 15h30 às 23h30** (tabela `turno`, migração 0005, hora local da unidade). É o
   horário de quem trabalha; o horário de abertura da loja é outro (9h ou 10h, fecha
   23h30). A pessoa está **no turno** quando há turno em andamento e ela entrou no mesmo
   dia de trabalho (até 1 h antes do primeiro turno). Quem faz os dois turnos continua no
   turno; uma sessão aberta ontem à noite não vale hoje de manhã; depois das 23h30 ninguém
   está no turno. Sem sessão, não recebe nada. A tela para mudar os turnos vem com os
   horários (E07/E12); até lá, só pelo banco.
2. **Dois tipos de aviso** (`aviso.natureza`):
   - **operacional**: nasce de um fato do sistema (ex.: código bloqueado). Vale **até o fim
     do turno em que nasceu** (15h30 ou 23h30). Quem só está no turno seguinte não recebe.
     Nascido fora de turno, vale 30 min e fica só registrado;
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
comunicado só pela gerência, quem leu e quem não leu. Testes de tela em `avisos.spec.ts`
nos 3 tamanhos.
