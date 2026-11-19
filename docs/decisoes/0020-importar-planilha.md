# 0020: importar planilha (E07, parte 3)

- Data: 19/11/2026
- Status: aceita; hipóteses abaixo
- Assunto da sessão: E07 parte 3, importação de planilha
- Complementa: decisões 0015 (ingredientes e cadastro em lote), 0018 (produtos) e o padrão de ajuda
  em cada campo (ideia nº 4, decisão 0012)

## Contexto
O responsável pediu importação de planilha (.xlsx, .csv e também .html com tabela), com relatório de
erros por linha na tela e sem gravar até estar certo. Critério do roteiro (E07): "planilha de exemplo
importada com os erros apontados". O cardápio e os insumos reais vão chegar em planilhas; digitar um
por um não é viável. Regras que já valem: dinheiro em centavos inteiros, nome único entre os ativos,
nada se apaga, tudo auditado, permissão no servidor.

## Decisão
1. **O que importa:** ingredientes (nome, unidade do estoque, área, fornecedor opcional, embalagens
   opcionais) e produtos (nome, categoria pelo nome, tipo de produção pelo nome ou vazio, preço em
   reais, tempo de preparo, descrição). Uma planilha é de um tipo só.
2. **Nunca cria o que falta:** categoria, tipo de produção ou fornecedor que não existe (ou está
   desativado) é erro na linha, com a instrução de cadastrar antes.
3. **Formatos, decididos pelo conteúdo** (`packages/dominio/src/planilha-ler.ts`), só no servidor:
   - .xlsx com a biblioteca **exceljs 4.4.0** (MIT, a mais usada para ler e escrever .xlsx em Node; o
     pacote `xlsx` do npm foi descartado por estar parado e com falhas de segurança conhecidas). O zip é
     aberto pelo próprio sistema (`abrirZip`), parte por parte, **contando os bytes reais** ao
     descompactar e parando no limite (até 6 MB por parte, 10 MB no total, 1.000 partes): o tamanho
     escrito no índice pode ser mentira. Recusa índice que não bate com o cabeçalho da parte, parte que
     abre com tamanho diferente do declarado, senha, zip64 e compressão desconhecida. O exceljs só
     recebe um zip novo, sem compressão, montado com as partes já conferidas. Lê a primeira aba visível
     com dados e avisa se houver outras.
   - Número de célula do Excel vira texto com vírgula; imprecisão de conta (32.989999999999995) sai
     com 2 casas ("32,99") só quando a diferença para os centavos é menor que um milionésimo; com mais
     casas de verdade o preço dá erro "mais de 2 casas decimais". O valor gravado continua vindo de
     `centavosDoTexto` (inteiro).
   - .csv/.txt: separador `;`, `,` ou tabulação descoberto na primeira linha (e a dica `sep=` do
     Excel); acentos em UTF-8 (com ou sem marca), UTF-16 com marca e, se não for UTF-8 válido,
     Windows-1252.
   - .html/.htm, e o ".xls" que é HTML por dentro (comum em exportação de sistemas): lido como dado
     com **parse5 8.1.1** (MIT, o leitor de HTML do jsdom); só o texto das células de `<table>`;
     script, style e afins ignorados; nada é executado nem mostrado como HTML. Várias tabelas: a maior.
     Os passeios pela árvore usam pilha própria (sem recursão): 300 mil níveis de aninhamento não
     derrubam o servidor.
   - .xls binário antigo é recusado com a instrução "Salvar como .xlsx". PDF, imagem, zip com nome de
     .csv, texto com nome de .xlsx e extensão fora da lista são recusados.
   - Limites: 2 MB, 2.000 linhas de dados, 50 colunas. O pedido HTTP também tem teto (o arquivo vai em
     base64 no JSON) conferido pelo cabeçalho e contando os bytes; a permissão é conferida antes de ler.
4. **Cabeçalhos flexíveis:** a primeira linha com texto é o cabeçalho; nomes comuns são aceitos sem
   ligar para acento e maiúscula ("Produto", "Valor", "Preço (R$)", "Seção"...). A tela mostra o mapa
   (campo -> coluna) e a pessoa troca; a conferência roda de novo.
5. **Conferir não grava nada** (`conferirPlanilha`): cada linha volta "Pronta", "Com erro" (motivo em
   português, com o número da linha e a coluna, ex.: "Coluna D (Preço)") ou "Já cadastrada" (nome
   ativo igual, sem ligar para acento: será pulada). Nome repetido dentro da planilha é erro na
   segunda ocorrência. A tela mostra o resumo, filtra por situação e baixa o relatório de erros (.csv,
   com proteção contra fórmula no Excel).
6. **Gravar** (`gravarPlanilha`): só com zero linhas com erro, ou com as linhas com erro marcadas
   "Pular" pela pessoa. O servidor lê o arquivo de novo e confere tudo de novo dentro da transação
   (não confia na tela). **Tudo numa transação: ou tudo, ou nada.** Ingredientes usam a mesma regra
   do cadastro em lote (`gravarLoteDeIngredientes`, embalagem lida por `lerEmbalagemDoTexto` da lista
   colada); produtos, a do cadastro de produto (`gravarProdutoNaTransacao`; vão para o fim da categoria).
7. **Idempotência:** a conferência devolve uma chave; a gravação com a mesma chave e o mesmo pedido
   devolve o resultado da primeira vez (clique duplo, reenvio). Trava por chave (advisory lock) e
   `UNIQUE` na tabela `importacao_planilha` (migração 0014). A mesma chave com outro arquivo, mapa ou
   linhas puladas é recusada (assinatura sha-256).
8. **Registro e auditoria:** `importacao_planilha` (só inserção) guarda quem, arquivo, formato,
   linhas lidas, criados, já existentes, puladas e os ids. A auditoria tem um registro da importação
   e um por item criado (`operacao: importar_planilha`, chave e número da linha).
9. **Permissão:** `cadastros.gerenciar` para conferir, gravar e baixar o modelo (três rotas na matriz
   da API). Supervisor não vê o botão e a tela diz que o cargo não permite.
10. **Tela:** `/cadastros/importar`, aberta pelo botão "Importar planilha" em Ingredientes e em Produtos
    (não entrou item novo no menu, que já tem 7). Modelos para baixar (.xlsx e .csv) com as colunas e 2
    linhas de exemplo inventadas.

## Hipóteses (a confirmar com o responsável)
- Área e unidade vazias só passam quando o nome está no catálogo pronto (ele completa, com aviso).
- Embalagem que não dá para converter sozinho (ex.: "saco 3 kg" de algo contado em un) é erro na
  linha: cadastre essa embalagem depois, na tela do ingrediente.
- Preço com ponto de milhar segue `centavosDoTexto` (decisão 0018): "1.234" é mil duzentos e trinta e
  quatro reais. Número vindo de célula do Excel é lido com vírgula decimal (29,9 -> R$ 29,90).
- Linha já cadastrada é pulada; a importação não altera cadastro existente (atualizar preço em massa
  fica para quando for pedido).

## Atenção para o futuro: fórmula em .csv
Nome que começa com `=`, `+`, `-` ou `@` é gravado como está (é um nome válido). **Toda exportação
futura para .csv (ou .xlsx como texto) deve neutralizar fórmula**, pondo um apóstrofo antes, como o
relatório de erros desta tela já faz (`linhasParaCsv` em `importar-comum.ts`).

## Alternativas descartadas
- Pacote `xlsx` (SheetJS) do npm: parado no npm e com falhas de segurança conhecidas.
- Ler a planilha no navegador: a regra e o limite ficariam na tela; o servidor é que decide.
- Guardar o arquivo entre conferir e gravar: a tela reenvia o arquivo e o servidor relê (sem estado
  guardado, nada gravado na conferência).
- Criar categoria ou fornecedor que falta: cadastro errado entraria sem ninguém ver.

## Consequências
Dependências novas em `@erp/dominio`: exceljs e parse5. O `pnpm audit` aponta 1 aviso moderado no
`uuid` 8 que vem com o exceljs (só vale para as funções v3/v5/v6 com buffer; o exceljs usa só a v4).
Refatorações sem mudar regra: `cadastrarEmLote` e `salvarProduto` passaram a chamar um miolo que roda
dentro de uma transação já aberta; a lista colada passou a usar `lerEmbalagemDoTexto` (mesma lógica).

## Critério de aceite e evidência
- `packages/dominio/testes/importar-planilha.teste.ts` (PostgreSQL real): formatos, acentos,
  separadores, recusa pelo conteúdo, limites, zip que incha (declarando o tamanho honesto e
  MENTINDO), HTML com 300 mil níveis, número com imprecisão de conta, cabeçalhos, erros com linha e coluna,
  nada gravado na conferência, gravação com erro recusada, revalidação, tudo ou nada (falha na 3ª
  linha desfaz as outras), idempotência com cliques ao mesmo tempo (produtos e ingredientes), permissões e modelos.
- `apps/gestao/testes/importar-api.teste.ts` e a matriz da API (3 rotas novas).
- `apps/gestao/testes-tela/importar.spec.ts`: a planilha de exemplo com os erros apontados, filtro,
  relatório, troca de coluna, pular, gravar com clique duplo, .xlsx de ingredientes, .html, arquivo
  recusado e celular sem estouro. Arquivos de exemplo em `apps/gestao/testes-tela/arquivos/`.

## Revisão independente (19/11/2026)
A 1ª revisão reprovou: zip que mente o tamanho (abria 1,5 GB), HTML muito aninhado (estourava a
pilha), limite aberto generoso (40 MB), garantia final da chave sem comparar a assinatura, faltava o
teste de cliques simultâneos em ingredientes e o número com imprecisão de conta virava erro. Tudo
corrigido como descrito acima, com testes.
