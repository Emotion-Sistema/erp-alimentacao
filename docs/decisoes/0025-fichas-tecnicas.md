# 0025: fichas técnicas (E08)

- Data: 19/11/2026
- Status: aceita
- Assunto da sessão: E08, fichas técnicas

## Contexto
A E08 pede receitas versionadas, rendimento e custo do prato (roteiro). O RC-01 manda calcular o
consumo pela ficha, aplicar rendimento e perda uma vez e gravar no pedido a versão usada. O relatório
do responsável sobre as 59 fichas reais da casa (18/11/2026) mostrou como elas são de verdade:
preparos da casa usados dentro de outras fichas, receitas em lote, perdas medidas, opcionais,
medidas caseiras e "a gosto", nomes diferentes para o mesmo item e muitas pendências. O responsável
pediu que fichas incompletas entrem assim mesmo, com as pendências à vista (19/11/2026), e aprovou
os acréscimos: ficha de tamanho e de adicional, custo e margem por canal, versão para a cozinha e
comparar versões.

## Decisão
1. **Uma ficha descreve um alvo** (migração 0019): produto do cardápio, tamanho de produto (receita
   própria daquele tamanho), adicional (o que ele acrescenta) ou **preparo da casa**, que rende numa
   unidade (g, ml, un) e entra em outras fichas como se fosse ingrediente. Combo não tem ficha: cada
   opção usa a do seu produto. Uma ficha ativa por alvo.
2. **Versões imutáveis:** gravar a receita cria a versão N+1 (gatilhos impedem mudar ou apagar
   versão, item e pendência). Editar exige a versão que a pessoa abriu (`versaoBase`); se outra
   pessoa gravou antes, recusa com aviso. Ligar e desligar não cria versão. Preparo em uso não desliga.
3. **Item:** ingrediente OU preparo, quantidade na unidade do estoque (decimal exato, até 4 casas),
   opcional, medida caseira e observação. **Quantidade vazia = pendência.** Rende: porções (produto,
   tamanho, adicional; lote "5 kg = 80 pratos" = rende 80) ou quantidade do preparo.
4. **Dois consumos, de propósito (RC-01: "a venda consome o molho, nunca os ingredientes de novo"):**
   - **Direto** (`consumoDaFicha`, é o que a E11 baixa): ingredientes E preparos da receita, sem abrir
     os preparos, em **fração exata** (a E11 multiplica pela quantidade vendida e só então arredonda).
     O preparo tem estoque próprio: produzir o lote baixa os ingredientes dele (pela ficha do preparo);
     vender o prato baixa o preparo.
   - **Expandido** (ingredientes crus): abre os preparos pela versão atual; serve ao custo, aos
     alergênicos (S1) e para mostrar. Nunca baixa estoque.
   - Item com tamanho: vale a ficha do tamanho, se houver (receita inteira daquele tamanho); senão,
     a do produto. Adicional soma a ficha dele. Produto com ficha em todos os tamanhos ativos não
     aparece como "sem ficha".
   - Ficha desligada ou de item fora do cardápio não dá consumo.
5. **Regra única de custo** (`analisarFichas`, em `fichas-comum`): abre os preparos pela
   versão atual (até 8 níveis, julgados a partir de cada ficha; ao gravar, a ficha e todas as que a
   usam são conferidas contra receita circular e profundidade, sob a trava das fichas),
   soma por ingrediente e divide pelo rendimento. Conta com **frações exatas** (BigInt); o custo só é
   arredondado no fim, para centavos (meio para cima). A perda fica na própria receita (bacon: 291 g
   cru rendem 138 g), aplicada uma vez.
6. **Pendências:** automáticas (sem itens, sem rendimento, item sem quantidade, ingrediente ou preparo
   desativado, preparo incompleto) e anotadas pela equipe. **Ficha com pendência não baixa estoque**
   (`consumoDaFicha` recusa). Ingrediente sem preço não é pendência da receita: deixa o custo
   **parcial**.
7. **Custo de referência** no ingrediente (centavos por quantidade na unidade do estoque, ex.: R$ 45,90
   por 1000 g) até as compras trazerem o preço real (E09/E10). **Margem:** custo sobre o preço na loja
   e no delivery (produto; tamanho = preço + acréscimo; adicional = preço dele), com alerta acima de um
   limite editável (padrão 35%).
8. **Permissões:** ver a receita = `cadastros.ver` (a cozinha também); custo, margem e custo de
   referência só para `custos.ver` (o servidor tira); gravar = `cadastros.gerenciar`; custo de
   referência pede as duas. Auditoria em tudo.
9. **Importar por planilha:** uma linha por item, colunas fixas (ficha, tipo, rende, unidade do
   rendimento, porção, tempo, validade, ingrediente, quantidade, unidade, opcional, medida caseira,
   observação, pendência, etapa). Confere antes (nada gravado), grava tudo numa transação só
   (ingredientes novos se pedido, preparos em ordem de dependência, depois produtos); ficha igual à
   atual não ganha versão nova. Opção "pular as com erro": grava as boas e deixa de fora as com erro
   e as que usam um preparo com erro. As receitas reais da casa **não entram no repositório** (público
   desde 19/11/2026): a planilha fica no Drive e é importada pela tela Cadastros → Fichas técnicas → Importar. Na conferência, cada ficha volta com a versão atual; ao gravar (chave "tipo:nome"), a tela manda essas versões e a ficha que mudou nesse meio-tempo é recusada. Linhas repetidas do mesmo item somam; "1.000" é recusado como ambíguo (escreva 1000); nome de preparo nunca vira ingrediente; a nova versão herda observações e equipamentos (a planilha não tem essas colunas).

## Hipóteses (reversíveis)
- Opcional conta no consumo (baixa como se fosse); a E11 pode passar a perguntar.
- Todo preparo tem estoque próprio (feito em lote). Preparo feito na hora, item a item, entra como
  ingredientes na ficha do produto.
- Produto que vira combo precisa desligar a ficha antes; religar ficha confere o alvo de novo.
- Ficha de tamanho é a receita inteira daquele tamanho (não um acréscimo).
- Limite de alerta do custo: 35% do preço.
- A auditoria guarda o custo de referência antes e depois: hoje todo cargo com `auditoria.ver` tem
  `custos.ver`. Se um cargo novo ganhar `auditoria.ver` sem `custos.ver`, rever (matriz de permissões).
- Renomear um preparo vale para todas as versões (o nome é da ficha, fica na auditoria).
- O custo de cada item, quando o preparo dele tem custo parcial, aparece sem marca própria (o
  custo da ficha já sai marcado como parcial).

## Alternativas descartadas
- Custo em float ou arredondado a cada passo: erro de centavos que se acumula em preparos.
- Editar a versão no lugar: perde o que o pedido usou (RC-01, RC-17).
- Preparo como ingrediente comum com preço digitado: não abriria o consumo real para o estoque.

## Critério de aceite e evidência
`packages/dominio/testes/fichas.teste.ts` (PostgreSQL real): custo do cheese com bacon preparado
conferido à mão (491 centavos; consumo de bacon cru 59,0435 g), lote do arroz, tamanho e adicional
com margem, pendências, versões e histórico imutável, receita circular, alvos, itens, permissões e
custo de referência, painel, concorrência determinística (verificada por mutação).
`fichas-importar.teste.ts`: conferir, gravar, repetir sem mudança, erros por linha, círculo,
permissão. Testes de tela das fichas.

## Adendo de 19/11/2026: corrigir no painel (ideia nº 13)
A importação de fichas aceita `correcoes` por célula, como a de cadastros (adendo da decisão 0020):
aplicadas no servidor antes de montar e conferir; a conferência devolve o cabeçalho, as células das
linhas com erro e as opções das colunas de escolha; erros de campo da ficha apontam a linha de onde o
valor veio.
