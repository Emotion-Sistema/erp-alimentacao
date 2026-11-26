# 0029: linhas de reposição e avisos, um por cruzamento (E10 parte 1, só regras)

- Data: 25/11/2026
- Status: proposta. As hipóteses abaixo são reversíveis e esperam o "ok" do responsável.
- Assunto da sessão: E10, reposição (RC-09 seções 3 e 4), parte 1: regras sem tela

## Contexto
O RC-09 pede, por ingrediente, linha saudável e de emergência sobre o total (em uso + guardado),
nível de abastecimento do em uso, avisos com prioridade e ação, e "avisa uma vez por cruzamento".
A E09 (decisão 0027) já tem saldo por lote, área e local, movimentos imutáveis, a passagem
automática do guardado (linhas `automatica`) e a trava do item em todo lançamento. A lista de
compras é de outra frente (`cerebro/frentes/lista-de-compras.md`, combinação 1): a E10 fica com
linhas e avisos e só "avisa a lista". Migração livre: 0025 (a última era a 0024). Decisão livre:
0029.

## Decisão
1. **Migração 0025** (só adiciona; reversão testada): `estoque_linha` por item de estoque e área
   (saudável, emergência, abastecimento: decimais de 4 casas, opcionais, `emergência <= saudável`;
   `aviso_guardado` urgente | normal | desligado; quem mudou e quando). Cada inserção ou mudança
   vira linha em `estoque_linha_mudanca` por gatilho (imutável, sem apagar nem TRUNCATE).
   `estoque_reposicao_estado` por item e área: situação (saudável, repor, emergência, esgotado),
   `usando_guardado`, `abastecer`, quantidades da última avaliação e o dia dela (não se apaga).
   `estoque_reposicao_evento`: cada mudança de estado, com o movimento e o aviso que gerou (imutável).
2. **Ponto central**: `Lancamento.fechar()` (estoque.ts). Todo caminho que muda saldo passa por
   `mexer` e `fechar`: entrada, saldo inicial, consumo, produção, perda, bloqueio, desbloqueio,
   transferência, recebimento confirmado ou recusado, ajuste de contagem e estorno. `mexer` anota
   cada (item, área) tocado e se houve passagem automática saindo do guardado; `fechar` chama
   `reavaliarReposicao` na mesma transação, com o item já travado (FOR UPDATE). Por isso duas
   vendas ao mesmo tempo nunca avaliam o mesmo item juntas: a segunda espera e lê o estado da
   primeira. Consumo repetido pela chave sai antes do lançamento: nenhuma reavaliação, nenhum aviso.
3. **Total considerado** = livre da área: em uso + guardado, **sem bloqueado, sem vencido e sem
   "a receber"** (hipótese: o que não pode ser usado não conta para comprar). Zero = esgotado;
   abaixo da emergência = emergência; abaixo da saudável = repor; em cima da linha ainda não cruzou.
4. **Avisos** (`criarAviso`, com `dados` = itemId, ingredienteId/preparoId, área, estado,
   quantidade, em uso, guardado, linhas, `paraRepor` e movimento, para a lista de compras usar):
   | Quando | Prioridade | Para |
   |---|---|---|
   | Piorou para repor | Normal | gerente geral (ação: lista de compras) |
   | Piorou para emergência | Urgente | gerente geral (comprar agora) |
   | Esgotou | Urgente | gerente geral e quem cuida da área |
   | Começou a usar o guardado | Urgente (ou normal, ou nenhum, pelo `aviso_guardado`) | gerente geral |
   | Precisa trazer do guardado | Normal | quem cuida da área (cozinha: cozinheira; salão: supervisor) |
   Só avisa quando a situação **piora**; recuperar (inteira ou em parte) não avisa e "rearma".
   Pulo direto de saudável para emergência gera um aviso só (o mais grave).
   O aviso para quem cuida da área não leva quantidades no texto (contagem cega) nem no `dados`:
   quando algum destinatário não é da gestão de compras ("abastecer" e "esgotado"), o `dados` leva
   só itemId, área, situação (`estado`), movimento e a ação do botão. Os avisos só para o gerente
   geral (repor, emergência, uso do guardado) levam tudo.
5. **Usando o guardado**: liga quando o consumo (ou a produção) traz do guardado; desliga quando o
   em uso volta a ter saldo livre (alguém abasteceu). Um aviso a cada vez que COMEÇA a usar.
   **Abastecer** = (em uso abaixo do nível de abastecimento OU usando o guardado) E há guardado
   livre para trazer (hipótese: sem guardado, "trazer do guardado" não faz sentido; a compra avisa).
6. **Quais áreas são avaliadas**: a área do item, uma área com linha definida ou uma que já tem
   estado. Item que passa por outra área sem linha lá não gera aviso dela.
7. **Linha definida ou mudada**: a avaliação grava o evento e avisa normalmente quando a situação
   é ruim, mesmo sem estado anterior (ex.: item com 300 de antes da migração, sem movimento depois,
   e linha saudável 500 = um aviso de repor, com o `desde` preenchido; a venda seguinte não repete;
   o mesmo para "esgotado"). **Começo calado** só numa área que nunca teve saldo nem movimento do
   item **e** não é a área do próprio item (ex.: a linha do leite na cafeteria antes de ele chegar
   lá): o estado começa em "esgotado" sem aviso nem evento. Hipótese: ingrediente novo, ainda sem
   compra, com a linha definida na área dele avisa "esgotado" uma vez (ele está mesmo fora de venda).
   "Nunca teve" = nenhuma linha de saldo do item na área (todo movimento deixa uma, que não se apaga).
8. **Quem define as linhas**: quem cuida da área, como o resto do estoque (`estoque.cozinha` /
   `estoque.salao`; RC-09 seção 4: "quem cuida: linha, contagem, perda"). Isso já inclui a
   supervisão no salão e a gestão de compras (gerente geral, dono, administrador) em todas as áreas.
   Nenhuma ação nova na matriz. Recusa auditada pelo `exigir`. Mandar as mesmas linhas de novo não
   repete o histórico.
9. **Encaixe com a lista de compras**: `itensParaRepor(area?)` (só `compras.gerenciar`) lê o estado:
   repor, emergência e esgotado, o mais grave primeiro, com `paraRepor` = saudável - livre, o
   "a receber" só como informação, e o fornecedor do ingrediente (para agrupar). Não cria lista.
10. **Sugestão** (`sugerirLinhas`, critério 9; nunca grava): consumo = o que consumo e produção
   gastaram do item na área (líquido por movimento; a passagem automática se anula), menos o que foi
   desfeito; perda não entra. Período: `dias` (padrão 28) até `ate` inclusive (padrão hoje,
   hipótese), no fuso da loja. Média diária = consumo / dias; emergência = média x prazo do
   fornecedor do cadastro (se houver; senão o prazo informado; sem nenhum, recusa pedindo o prazo);
   saudável = emergência + média x folga (padrão 3 dias, hipótese). "Dura até" = livre / média, em
   dias inteiros para baixo, contado de hoje. Conta exata, arredondada só no fim (`calcularSugestao`).
11. **Conferência**: `conferirEstoque` também confere que o estado de cada item e área bate com o
   saldo livre (vencido contado pelo dia da avaliação) e com as linhas atuais. A virada do dia é
   tolerada até o dia seguinte; estado com lote que venceu antes de ontem e não foi reavaliado é
   acusado ("sem a reavaliação da virada do dia": o worker não rodou).
12. **API** (sem tela): `GET/POST /api/estoque/linhas`, `GET /api/estoque/linhas/sugestao`,
   `GET /api/estoque/repor`, na matriz da API.
13. **Virada do dia** (`reavaliarReposicao(db, { agora? })`): reavalia os itens e áreas com lote
   de saldo livre que venceu depois da última avaliação (e os ainda sem estado, na área do item ou
   numa área com linha). Mesma avaliação e mesma trava dos movimentos: itens por id, 10 por
   transação; avisos uma vez por cruzamento, mesmo com duas execuções ao mesmo tempo. Roda no
   worker pelo agendador do pg-boss (`schedule`), que já mora no PostgreSQL (decisão 0003: nada
   novo): minuto 1 de toda hora no fuso da loja (00:01 = logo depois da virada), `missed: once`
   para as horas em que o worker esteve fora, fila `stately` (não acumula) e uma vez ao subir.
14. **Desempenho**: toda soma de saldo do estado filtra `quantidade > 0`, para usar o índice parcial
   `estoque_saldo_item` (sem ele, o banco percorria a tabela inteira com o item travado).

## Fica para a parte 2
- Agrupar ("5 itens entraram em reposição") e horário de silêncio para o que não é urgente.
- Urgente não lido repetido e "sobe para o gestor" depois de um tempo; e o aviso que nasce fora do
  turno: hoje o aviso operacional vale até o fim do turno + margem (decisão 0013), então uma
  emergência de madrugada pode expirar sem ninguém ver. O estado não se perde (o `itensParaRepor`
  continua mostrando), mas o aviso sim. Precisa do worker.
- Cadastro não reavalia: mudar a área de estoque do ingrediente (ou do preparo), inativar ou
  reativar não muda o estado de reposição na hora; só no próximo movimento, na próxima mudança de
  linha ou na reavaliação da virada (se houver lote vencendo).
- Sugestão por dia da semana (RC-09: "sábado gasta mais que terça") e telas (painel com semáforo,
  "dura até", definir e aceitar sugestão).
- Preparo intermediário acabando ("abrir ordem de produção") e consumo fora do normal.

## Alternativas descartadas
- Avisar a cada venda abaixo da linha: o RC-09 proíbe (um por cruzamento).
- Calcular o estado só na leitura (sem tabela): não daria para saber se já avisou, nem garantir um
  aviso só com vendas simultâneas.
- Gatilho no banco sobre `estoque_saldo`: dispararia por linha de saldo (várias por movimento) e
  esconderia a regra do código; o fechamento do lançamento já é o ponto único, sob a trava.
- Contar bloqueado e vencido no total: compraria tarde (o item "existe" mas não pode ser usado).

## Consequências
- A E11 não precisa fazer nada: `consumirNaTransacao` já passa pelo fechamento.
- Todo movimento faz uma leitura a mais por (item, área) tocado (soma de saldo com índice); avisos
  só nas mudanças.
- Itens sem linha também avisam quando esgotam e quando começam a usar o guardado (o RC-09 pede
  esses avisos para todo item). Na homologação, o primeiro movimento de cada item depois da migração
  (ou a primeira linha definida, ou a virada do dia com lote vencido) cria o estado; item que já
  esteja zerado ou abaixo da linha avisa uma vez nesse momento.
- O worker passa a depender de `@erp/dominio` (mesma imagem; o papel `erp_worker` já tem as mesmas
  permissões do `erp_app` nas tabelas).

## Critério de aceite e evidência
`packages/dominio/testes/estoque-reposicao.teste.ts` contra PostgreSQL real: cruzar a saudável = 1
aviso e 10 vendas seguintes = nenhum; recuperar e cair = novo aviso; emergência urgente (pulo direto
= um aviso; recuperar em parte e cair de novo = novo aviso); esgotado urgente para gerente e
cozinheira; bloqueado (em uso e guardado) fora do total; 5a: primeira venda usando o guardado = 1
urgente (em uso 6 + guardado 40, consumo 10: em uso 0, guardado 36), seguintes não, abastecer avisa
de novo; desligado e rebaixado; abastecimento (sem guardado não avisa); "a receber" não conta até
confirmar; desfazer que recupera; duas vendas simultâneas (Promise.all, 3 rodadas) = 1 aviso; dez
simultâneas usando o guardado = 1 aviso de guardado e 1 de abastecer; consumo repetido pela chave =
nenhum aviso ou evento novo; área alheia recusada e auditada; histórico imutável; lista para repor
em ordem com `paraRepor`; sugestão bate com a conta manual (pura e pelo banco, com desfazer
descontado e prazo do fornecedor); conferência acusa estado errado.
Prova de mutação (cada uma derruba pelo menos um teste): sem a reavaliação no fechamento; avisar
também ao recuperar; avisar a cada venda abaixo; "usando guardado" que nunca desliga; ignorar o
"desligado"; avisar o guardado a cada venda; sem o começo calado; abastecer sem guardado; "a
receber" contando; bloqueado contando; sem a trava do item (o teste de duas vendas simultâneas falha).
Correções da revisão do PR 158 (também com prova de mutação): linha sobre saldo sem estado (300 e
saudável 500 = um aviso, `desde` preenchido, venda seguinte calada; o mesmo para esgotado; área que
já teve o item avisa); `dados` sem quantidades para cozinheira e supervisor; lote que vence sem
movimento = emergência, um aviso, e duas reavaliações em paralelo (3 rodadas) = um aviso; conferência
acusa reavaliação atrasada. Mutações que derrubam: começo calado antigo; sem começo calado; área do
item calada; sem olhar o saldo anterior da área; `dados` sempre completo; reavaliação sem trava;
reavaliação ignorando o dia; sem acusar a atrasada.

## Parte 2 (26/11/2026): telas e começo calado
- **Telas (visual Balcão, decisão 0028):** no painel do Estoque, cada item ganha o selo da pior
  situação nas áreas vistas (Repor, Emergência, Esgotou) e "Trazer do guardado"; chip "Para repor".
  Na gaveta do item, o bloco "Linhas de reposição" (definir as linhas, "Usar sugestão", "dura até",
  histórico). Em Compras, a primeira aba é "Para repor" (lista por gravidade, por área, baixar CSV;
  só `compras.gerenciar`). O painel recebe `reposicao` (situação por área, sem quantidades; some na
  área em contagem cega para quem conta). `LinhasDaArea` traz a observação atual.
- **Começo calado também na área do item:** a primeira avaliação, sem movimento (definir a linha), de
  uma área que nunca teve saldo do item não avisa, nem na área do próprio item. Assim a primeira
  carga de linhas não vira centenas de "esgotou" para ingredientes que nunca foram comprados. O
  estado nasce "esgotado" e o item entra na lista para repor. Item que já teve saldo avisa normalmente
  (também o que só teve saldo "a receber"). Aceito: se a primeira compra ficar abaixo da emergência,
  esgotado -> emergência é melhora e não avisa; o item fica na lista "Para repor".
- Evidência: `estoque-reposicao.teste.ts` (parte 2: nunca comprado não avisa e entra na lista; já
  teve saldo avisa; situação no painel e contagem cega) e `apps/gestao/testes-tela/reposicao.spec.ts`.
## Parte 2 (26/11/2026): avisos mais calmos
- **Urgente não visto sobe para o superior** (RC-18; migração 0028; `estoque-avisos-subir.ts`). O
  worker confere a cada 5 minutos: aviso urgente de emergência, esgotou ou "começou a usar o
  guardado" que ainda vale (turno), nasceu há 15 minutos ou mais e ninguém viu vira um aviso novo,
  urgente, `estoque.subiu`, para o superior de quem devia ter visto (cozinheira, auxiliar e supervisor
  -> gerente geral; gerente geral -> dono), com o mesmo texto e o mesmo `dados` (sem quantidades se
  o original já ia sem elas). Só sobe se o problema continua (o item segue em emergência ou esgotou;
  segue usando o guardado), no máximo um por item e área a cada vez (o mais novo), e não sobe se um
  aviso mais novo do mesmo item e área já foi visto. O sino só marca "visto" o que aparece nele (os 15
  primeiros cartões): o resto não conta como visto e pode subir. Cada aviso sobe uma vez só: `aviso_subida` com chave primária, sob uma trava, mesmo
  com duas execuções ao mesmo tempo. Hipótese: 15 minutos para todos, até existir configuração; o
  aviso que subiu não sobe de novo. Vale só para os avisos do estoque; o RC-18 pede o mesmo para
  todo urgente, o que fica para a frente de avisos. A migração cria um índice sem `CONCURRENTLY`
  (segundos com o tamanho atual da tabela `aviso`); reverter e aplicar de novo deixa subir outra vez
  os urgentes do turno que já tinham subido.
- **Vários itens em reposição viram um cartão só** na central de avisos (o sino): "5 itens entraram
  em reposição", com a lista e um "Resolvido (todos)". Só os normais ainda não resolvidos; urgentes
  nunca se juntam; o histórico (/avisos) continua um por um. É só na tela: o aviso não muda depois de
  criado (RC-17), então juntar no banco exigiria atrasar o aviso.
- Evidência: `estoque-avisos-subir.teste.ts` (antes de 15 min não sobe; depois uma vez só; três
  execuções sobrepostas de verdade = uma, sem erro; no prazo exato sobe e 5 s antes não;
  esgotou que voltou à emergência sobe; emergência e guardado do mesmo movimento = um; mais novo visto = nenhum; visto não sobe e entregue sem ver sobe; resolvido não sobe, piorou sobe;
  turno acabado não sobe; esgotou sobe ao dono sem quantidades; guardado trazido não sobe) e
  `agrupar-avisos.teste.ts`. Mutações que derrubam: sem conferir se continua; sem olhar o "visto"; sem a trava; sem o "um
  por item e área". Revisão independente aprovada (26/11/2026), com os ajustes acima.
## Desperdício por vencimento (26/11/2026): ideia nº 15, D1, D7 e D4a
Migração 0029; `estoque-validade.ts`; entrada em `estoque.ts`. Só leitura e avisos: não muda saldo
nem o RC-01.
- **Dinheiro em risco (D1):** `GET /api/estoque/em-risco`, só com `custos.ver`, nas áreas que a
  pessoa vê. "Vence em 3 dias" = validade de hoje até hoje + 3 (7 dias inclui os 3); só em uso e
  guardado, sem o bloqueado (quarentena não vai ser usada) e sem o "a receber". Valor = parte do valor
  do item que cabe à quantidade (custo médio, como na saída). O vencido que continua no estoque
  (livre ou bloqueado) aparece à parte. Mostrado no painel do estoque. O "resumo do dia" ainda não
  existe: entra lá quando ele for feito.
- **Aviso "perto do vencimento" (D1, RC-09):** normal, para quem cuida da área e o gerente geral, uma
  vez por lote e área (`estoque_lote_aviso`, chave primária, sob trava), quando o lote livre vence
  hoje ou nos próximos 2 dias. Não avisa o lote que já entrou com 2 dias ou menos de validade (ex.:
  molho da casa que vale 2 dias): isso se sabe na entrada e a cozinha usa no dia; senão toda produção
  curta avisaria.
- **Vencido parado (D7):** normal, para quem cuida da área, uma vez por lote e área, quando o lote está
  2 dias depois da validade e ainda tem saldo (livre ou bloqueado): ninguém registrou a perda. Lote
  sem saldo (perda registrada) não avisa.
- Os dois rodam no worker de hora em hora (minuto 10) e **só com a loja em turno**: o aviso vale até o
  fim do turno (RC-18), e um aviso nascido de madrugada morreria antes de alguém ver. Os textos não
  têm quantidade (contagem cega). Aceito: o aviso de um lote aparece só no turno em que nasceu.
- **Validade curta na entrada (D4a):** campo opcional "validade mínima na entrada (dias)" no
  ingrediente (1 a 365; nulo = sem alerta; a alteração sem o campo mantém o valor). A compra que chega
  com menos dias **entra mesmo assim** (já está na loja): a resposta traz `validadeCurta` para a tela
  e, se quem deu entrada não é de compras, o gerente geral recebe um aviso normal
  (`estoque.validade_curta`) para falar com o fornecedor. Reenvio da mesma entrada (mesma chave) não
  repete o alerta nem o aviso. Não vale para saldo inicial nem para preparo da casa.
- Hipóteses (26/11/2026): 2 dias para "perto" e 2 dias para "vencido parado", até existir configuração.
- Revisão (26/11/2026): o reenvio da entrada devolve o alerta de novo (sem aviso novo); o dinheiro em
  risco só lista para quem também tem `estoque.desfazer` (contagem cega, como no painel). Ficam como
  ruído aceito: a sobra de contagem vira lote novo e pode avisar "perto" mais uma vez; na primeira
  execução em homologação todo vencido parado avisa de uma vez (um cartão por lote); turno que passe
  da meia-noite faria o aviso do dia novo morrer no fim desse turno (hoje o último turno acaba 23h30).
  Reverter a 0029 apaga as validades mínimas e as marcas de "já avisado".
- Evidência: `estoque-validade.teste.ts` (11 testes: somas em 3 e 7 dias, bloqueado fora, vencido à
  parte, recusa sem custos.ver com auditoria; perto uma vez só, não para o que entrou perto nem para o
  bloqueado, não fora do turno; vencido parado depois de 2 dias, não com perda registrada; duas
  execuções juntas = um aviso; histórico imutável; validade curta com aviso, sem aviso para quem
  compra, reenvio sem repetir; cadastro guarda, mantém e limpa). Mutações que derrubam: sem a trava;
  sem a regra do lote que entrou perto.

## Etiqueta do lote (26/11/2026): ideia nº 16, versão 1

Pedido: saber qual pacote é qual quando o mesmo produto entra em dias diferentes (bacalhau de hoje e
de amanhã, validades diferentes). Migração 0030, `packages/dominio/src/etiquetas.ts`.

- **Código do produto.** Todo ingrediente e preparo da casa tem um código curto, gerado pelo banco
  ao cadastrar (qualquer caminho: tela, planilha, cadastro em lote), pela regra aprovada: as 3
  primeiras letras (BAC = bacalhau); se já existir, a inicial de cada palavra completando com a
  última (QMI = queijo minas); depois a primeira letra + duas consoantes (BCN = bacon); por último 2
  letras + número (BA1). Só A-Z, sem acento. Os já cadastrados ganharam código em ordem alfabética.
  Pode ser trocado no cadastro (2 a 5 caracteres, começa com letra); o sistema recusa o código de
  outro produto (dizendo de quem é) e o que já foi impresso em etiqueta de outro produto.
- **Etiqueta do lote.** Cada lote de compra, saldo inicial ou produção de preparo ganha código +
  número que nunca se repete (BAC-001, BAC-002; passa a 4 dígitos sozinho). A numeração fica pelo
  código: trocar o código não reaproveita número. Quem preenche é o banco (ninguém escolhe à mão);
  dois lançamentos ao mesmo tempo não repetem número (o item já está travado pelo lançamento).
  Sobra de contagem e lotes de antes da 0030 ficam sem etiqueta. "Usa etiqueta" desligado (sal,
  açúcar, descartáveis): o lote entra sem etiqueta; ligado de novo, a numeração continua.
- **Onde aparece.** Na entrada e na produção ("Escreva na etiqueta: BAC-002 · vence 30/11"), no
  painel (achar por "BAC" ou "BAC-002"), na gaveta do item e nos avisos de validade ("Use primeiro
  o BAC-001"). A peça dividida entre áreas continua o mesmo lote, com a mesma etiqueta.
- **Achar pela etiqueta.** Aceita como estiver escrito ("bac 2", "BAC002"). Só acha lote com saldo
  nas áreas da pessoa; "não existe" e "não é seu" respondem igual. Durante a contagem cega a lista
  de etiquetas do item some (revelaria quantos lotes há).
- **Hipótese (reversível):** "usa etiqueta" nasce ligado para todos; o responsável desliga o que
  não precisa.
- **Fica para a versão 2:** etiqueta impressa com QR e leitura pela câmera (depende de testar a
  impressora, RC-04). Também para depois: contagem lote a lote (hoje a contagem é por item e
  local), etiqueta nos lotes antigos.
