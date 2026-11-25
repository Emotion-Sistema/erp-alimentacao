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
   O aviso para quem cuida da área não leva quantidades no texto (contagem cega).
5. **Usando o guardado**: liga quando o consumo (ou a produção) traz do guardado; desliga quando o
   em uso volta a ter saldo livre (alguém abasteceu). Um aviso a cada vez que COMEÇA a usar.
   **Abastecer** = (em uso abaixo do nível de abastecimento OU usando o guardado) E há guardado
   livre para trazer (hipótese: sem guardado, "trazer do guardado" não faz sentido; a compra avisa).
6. **Quais áreas são avaliadas**: a área do item, uma área com linha definida ou uma que já tem
   estado. Item que passa por outra área sem linha lá não gera aviso dela.
7. **Linha definida com o item nunca avaliado na área** (ex.: linha nova numa área vazia): o estado
   começa calado, sem aviso nem evento. Movimento avisa sempre. Com o item já avaliado, subir a
   linha acima do saldo avisa uma vez (o item está abaixo da linha agora).
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
   saldo livre (vencido contado pelo dia da avaliação, para a virada do dia não acusar) e com as
   linhas atuais.
12. **API** (sem tela): `GET/POST /api/estoque/linhas`, `GET /api/estoque/linhas/sugestao`,
   `GET /api/estoque/repor`, na matriz da API.

## Fica para a parte 2
- Agrupar ("5 itens entraram em reposição") e horário de silêncio para o que não é urgente.
- Urgente não lido repetido e "sobe para o gestor" depois de um tempo; e o aviso que nasce fora do
  turno: hoje o aviso operacional vale até o fim do turno + margem (decisão 0013), então uma
  emergência de madrugada pode expirar sem ninguém ver. O estado não se perde (o `itensParaRepor`
  continua mostrando), mas o aviso sim. Precisa do worker.
- Reavaliar quando um lote vence sem movimento (virada do dia): hoje o estado só muda no próximo
  movimento do item. Também do worker.
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
  cria o estado; item que já esteja zerado ou usando o guardado avisa uma vez nesse momento.

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
