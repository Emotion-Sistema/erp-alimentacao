# 0016: categorias e horários de venda (E07, parte 2, PR 1)

- Data: 17/11/2026
- Status: aceita (E07, parte 2); hipóteses no item 8
- Assunto da sessão: E07, cadastros
- Complementa: RC-09 seção 2a, decisões 0011 (matriz) e 0015 (cadastros)

## Contexto
Fatos do responsável (14/11/2026, RC-09 seção 2a): a cozinha fecha às 23h (último pedido em
qualquer canal) e a loja às 23h30. Abre às 9h de sexta a domingo e às 10h de terça a quinta.
Segunda é fechado. O delivery começa em outro horário, que muda conforme o dia. Por isso o horário
do delivery e o das categorias são preenchidos à mão, com um padrão semanal e ajuste no dia.
Só o gerente geral, o dono e o administrador mudam horários. A E12 (disponibilidade) e o pedido
(E11, E26) vão perguntar "pode vender agora?" e precisam de uma resposta única.

## Decisão
1. **Três camadas, vale a interseção:**
   1. **Unidade:** por dia da semana, abre, último pedido da cozinha e fecha.
   2. **Canal:** loja ou delivery, com janela própria por dia.
   3. **Categoria em cada canal:** janela própria por dia.

   Em cada dia, o canal e a categoria escolhem entre **segue** (vale a camada de fora), **fechado**
   ou **aberto** (de tal hora a tal hora). O que passa do último pedido da cozinha é cortado.
2. **A semana é o padrão** e se repete toda semana. Uma **data especial** (feriado, evento) troca
   o padrão só naquele dia: pode valer para a unidade, para um canal ou para uma categoria num
   canal. Fica uma por data em cada alvo. Cancelar desativa, nada se apaga.
3. **Pausa manual** de tudo, de um canal ou de uma categoria num canal. Dura um tempo (5 min a
   24 h) ou vale até alguém retomar. Grava quem pausou, quem retomou e quando.
4. **Regra única no banco:** `situacao_de_venda(unidade, canal, categoria, instante)` devolve se
   pode vender, o motivo e a hora em que abre ("Disponível a partir das 11h"). Usa sempre a hora
   local da unidade (`unidade.fuso_horario`). O servidor do pedido e as telas usam só essa função.
   Os textos de cada motivo ficam em `textoDaSituacao` (`@erp/dominio/horarios`).
5. **A semana do responsável já vem pronta.** Toda unidade nova nasce com ela (gatilho
   `unidade_semana_padrao`), e as unidades que já existiam a receberam na migração 0010.
6. **Categorias** (`categoria`) têm nome único entre as ativas (sem diferenciar acento nem
   maiúscula), descrição para o site e ordem. Começam com as linhas da casa: Cafeteria, Almoço,
   Porções, Hambúrgueres, Salgados e Bebidas, todas editáveis.
7. **Permissões:**
   - Ver horários: `cadastros.ver`.
   - Mudar semana, data especial e pausa: `horarios.gerenciar` (só gerente geral, dono e
     administrador, decisão 0011).
   - Criar ou mudar categoria: `cadastros.gerenciar`.

   Cada mudança vai para a auditoria com antes e depois. Duas pessoas mudando ao mesmo tempo
   entram uma depois da outra, por uma trava na unidade, e o "antes" da auditoria sai sempre
   certo.
8. **Hipóteses (a confirmar com o responsável):**
   - Uma janela por dia em cada canal ou categoria (não há "café das 9h às 11h e das 15h às 18h").
   - Nenhum horário passa da meia-noite (a loja fecha às 23h30).
   - A pausa manual é do mesmo grupo que muda horários. O "acabou" de um produto pelo estoque é
     outra coisa e fica na E12.
   - O horário de fechamento da loja (23h30) é informativo por enquanto. Quem decide venda é o
     último pedido da cozinha.
   - **Às 23h em ponto já não aceita pedido** (✔ confirmado pelo responsável em 17/11/2026). O último pedido aceito é o das 22h59. Vale o mesmo
     para o fim de qualquer janela.
   - As categorias valem para a empresa toda. Os horários são de cada unidade.
   - Numa data especial que abre a loja num dia normalmente fechado (evento numa segunda), o canal e
     as categorias seguem a semana daquele dia. Se o delivery está fechado às segundas, ele precisa
     de uma data especial própria. A tela avisa disso.

## Alternativas descartadas
- **Horário só por categoria, sem camada de canal.** O delivery teria de repetir o horário em
  cada categoria.
- **Várias janelas por dia.** A tela fica mais difícil para um ganho que ninguém pediu. Se for
  preciso, uma migração futura troca a chave única.
- **Regra calculada no TypeScript.** Haveria duas contas (tela e pedido) que podem divergir. A
  função no banco é a única.

## Consequências
- A E12 só chama `situacao_de_venda` para cada categoria e canal e junta com o estoque.
- O pedido (E11, E26) recusa no servidor o que estiver fora do horário, com o motivo pronto.
- Feriado e evento não exigem mexer na semana.

## Critério de aceite e evidência
Os testes em `packages/dominio/testes/horarios.teste.ts`, contra PostgreSQL real, cobrem:
- a semana do responsável, o fuso, a janela própria do delivery, a interseção com a categoria e o
  corte no último pedido;
- a data especial vencendo a semana, a pausa (do canal, da categoria e geral) e a categoria
  desativada;
- as restrições do banco, as permissões por cargo, a auditoria com antes e depois e a
  concorrência (duas pessoas salvando a mesma semana e criando a mesma data).

A matriz pela API (`apps/gestao/testes/matriz-api.teste.ts`) cobre as rotas novas para todos os
cargos.
